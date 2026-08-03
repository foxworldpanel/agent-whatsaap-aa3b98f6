// src/lib/agent-v3/orchestrator.server.ts
import { loadEnabledModulesV3, type LoadedModuleV3 } from "./brain/modules.server";
import { selectModulesV3, logModuleSelectorExecution, type ConversationContext } from "./selector/module-selector.server";
import { buildPromptFromModulesDetailed } from "./prompt/prompt-builder.server";
import { callAnthropicV3, extractAnthropicTextV3 } from "./integrations/llm-client.server";
import {
  sanitizeSystemLeaks,
  limitEmojiFrequency,
  detectVerboseLoop,
  humanizePunctuationV3,
  stripMarkdownFormattingV3,
} from "./brain/guards.server";
import { autoSplitLongPartsV3 } from "./integrations/audio-processor.server";
import { isConfirmedPurchaseMessage } from "./memory/customer-memory.server";
import type { BusinessDecisionV3 } from "./brain/business-state.server";
import { businessDecisionToPromptV3 } from "./brain/business-state.server";
import { MIND_OPERATIONAL_TRUTH_V3 } from "./brain/operational-truth.server";

type ParsedSpotifyPriceRule = {
  baseQuantity: number;
  basePrice: number;
  minQuantity: number | null;
  maxQuantity: number | null;
};

function parsePtBrNumber(value: string): number | null {
  const cleaned = String(value || "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSpotifyPriceRule(
  moduleContent: string,
  product: ConversationProductForPricing,
): ParsedSpotifyPriceRule | null {
  const labels: Record<ConversationProductForPricing, RegExp> = {
    plays: /Plays\s*\+\s*Ouvintes/i,
    ouvintes: /Plays\s*\+\s*Ouvintes/i,
    saves: /Saves?/i,
    seguidores: /Seguidores/i,
    playlist: /(?:10\s+Playlists|Playlists?)/i,
  };
  const line = moduleContent
    .split(/\r?\n/)
    .find((item) => labels[product].test(item));
  if (!line) return null;

  if (product === "playlist") {
    const flat = line.match(/R\$\s*([\d.]+(?:,\d+)?)/i);
    const price = flat ? parsePtBrNumber(flat[1]) : null;
    return price == null
      ? null
      : { baseQuantity: 1, basePrice: price, minQuantity: 1, maxQuantity: 1 };
  }

  const base = line.match(/([\d.]+)[^R\n]*R\$\s*([\d.]+(?:,\d+)?)/i);
  if (!base) return null;
  const baseQuantity = parsePtBrNumber(base[1]);
  const basePrice = parsePtBrNumber(base[2]);
  if (baseQuantity == null || basePrice == null || baseQuantity <= 0) return null;

  const minMatch = line.match(/m[ií]n\s*([\d.]+)/i);
  const maxMatch = line.match(/m[aá]x\s*([\d.]+)/i);
  return {
    baseQuantity,
    basePrice,
    minQuantity: minMatch ? parsePtBrNumber(minMatch[1]) : null,
    maxQuantity: maxMatch ? parsePtBrNumber(maxMatch[1]) : null,
  };
}

type ConversationProductForPricing = "plays" | "ouvintes" | "saves" | "seguidores" | "playlist";

function collectInstagramFollowerOptions(
  moduleKeys: string[],
  modules: Record<string, LoadedModuleV3>,
): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const key of moduleKeys) {
    const module = modules[key];
    if (!module) continue;

    const belongsToInstagram =
      key === "instagram" ||
      key.startsWith("instagram_") ||
      module.routing.platforms.includes("instagram");
    if (!belongsToInstagram) continue;

    for (const rawLine of String(module.content || "").split(/\r?\n/)) {
      const line = rawLine
        .replace(/^\s*[-•*]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!/seguidores?/i.test(line) || !/R\$\s*\d/i.test(line)) continue;

      const normalized = line
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      if (seen.has(normalized)) continue;
      seen.add(normalized);
      lines.push(line);
    }
  }

  return lines;
}


type CommercePlatform = "spotify" | "youtube" | "instagram" | "tiktok" | "kwai" | "facebook";
type CommerceProduct = NonNullable<ConversationContext["product"]>;

type GenericPriceRule = {
  platform: CommercePlatform;
  product: CommerceProduct;
  baseQuantity: number;
  basePrice: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  label: string;
  sourceKey: string;
};

const PRODUCT_PRICE_TERMS: Record<CommerceProduct, RegExp> = {
  seguidores: /seguidores?|followers?/i,
  curtidas: /curtidas?|likes?/i,
  visualizacoes: /visualiza(?:cao|coes)|views?/i,
  inscritos: /inscritos?|subscribers?/i,
  plays: /plays?|streams?/i,
  ouvintes: /ouvintes?|listeners?/i,
  saves: /saves?|salvamentos?/i,
  playlist: /playlists?/i,
  live: /live|pessoas\s+(?:na|em)\s+live/i,
  horas: /horas?|watch\s*time/i,
  comentarios: /comentarios?|comments?/i,
};

function moduleBelongsToPlatform(key: string, module: LoadedModuleV3, platform: CommercePlatform): boolean {
  return key === platform || key.startsWith(`${platform}_`) || module.routing.platforms.includes(platform);
}

function parseGenericPriceRuleFromLine(params: {
  line: string;
  platform: CommercePlatform;
  product: CommerceProduct;
  sourceKey: string;
}): GenericPriceRule | null {
  const { line, platform, product, sourceKey } = params;
  if (!PRODUCT_PRICE_TERMS[product].test(line) || !/R\$\s*\d/i.test(line)) return null;

  const priceMatch = line.match(/R\$\s*([\d.]+(?:,\d+)?)/i);
  const price = priceMatch ? parsePtBrNumber(priceMatch[1]) : null;
  if (price == null || price < 0) return null;

  const beforePrice = priceMatch ? line.slice(0, priceMatch.index ?? line.length) : line;
  const qtyMatches = [...beforePrice.matchAll(/\b([\d.]+)\b/g)];
  let baseQuantity = qtyMatches.length
    ? parsePtBrNumber(qtyMatches[qtyMatches.length - 1][1])
    : null;

  // Formato comum dos módulos Spotify: "Plays + Ouvintes: 1000 = R$ 15".
  // Para serviço unitário (playlist), ausência de quantidade significa 1 pacote.
  if (baseQuantity == null && product === "playlist") baseQuantity = 1;
  if (baseQuantity == null || baseQuantity <= 0) return null;

  const minMatch = line.match(/m[ií]n(?:imo)?\s*[:=]?\s*([\d.]+)/i);
  const maxMatch = line.match(/m[aá]x(?:imo)?\s*[:=]?\s*([\d.]+)/i);
  const label = line
    .replace(/^\s*[-•*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    platform,
    product,
    baseQuantity,
    basePrice: price,
    minQuantity: minMatch ? parsePtBrNumber(minMatch[1]) : null,
    maxQuantity: maxMatch ? parsePtBrNumber(maxMatch[1]) : null,
    label,
    sourceKey,
  };
}

function collectGenericPriceRules(params: {
  platform: CommercePlatform;
  product: CommerceProduct;
  moduleKeys: string[];
  modules: Record<string, LoadedModuleV3>;
}): GenericPriceRule[] {
  const { platform, product, moduleKeys, modules } = params;
  const rules: GenericPriceRule[] = [];
  const seen = new Set<string>();

  for (const key of moduleKeys) {
    const module = modules[key];
    if (!module || !moduleBelongsToPlatform(key, module, platform)) continue;
    for (const line of String(module.content || "").split(/\r?\n/)) {
      const rule = parseGenericPriceRuleFromLine({ line, platform, product, sourceKey: key });
      if (!rule) continue;
      const signature = `${rule.product}|${rule.baseQuantity}|${rule.basePrice}|${rule.label.toLowerCase()}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      rules.push(rule);
    }
  }
  return rules;
}

function platformDisplayName(platform: CommercePlatform): string {
  const names: Record<CommercePlatform, string> = {
    spotify: "Spotify",
    youtube: "YouTube",
    instagram: "Instagram",
    tiktok: "TikTok",
    kwai: "Kwai",
    facebook: "Facebook",
  };
  return names[platform];
}

function cleanPriceTableLine(rawLine: string): string | null {
  let line = String(rawLine || "")
    .replace(/^\s*[-•*]\s*/, "")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line || !/R\$\s*\d/i.test(line)) return null;

  // Só aceita linhas que parecem realmente um SKU/serviço comercial.
  const isKnownService = (Object.values(PRODUCT_PRICE_TERMS) as RegExp[]).some((pattern) => pattern.test(line));
  if (!isKnownService) return null;

  line = line
    .replace(/\s*[:=]\s*(?=R\$)/, " - ")
    .replace(/\s+[–—]\s+/g, " - ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  // "Plays: 1000 = R$ 15" -> "1000 Plays - R$ 15" quando for inequívoco.
  const reversed = line.match(/^([^:]{2,60}):\s*([\d.]+)\s*(?:=|-)\s*(R\$\s*[\d.]+(?:,\d+)?)$/i);
  if (reversed) line = `${reversed[2]} ${reversed[1].trim()} - ${reversed[3]}`;

  return line;
}

function buildGeneralPlatformPriceTable(params: {
  platform: CommercePlatform;
  modules: Record<string, LoadedModuleV3>;
}): string | null {
  const { platform, modules } = params;
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const [key, module] of Object.entries(modules)) {
    if (!moduleBelongsToPlatform(key, module, platform)) continue;
    for (const rawLine of String(module.content || "").split(/\r?\n/)) {
      const cleaned = cleanPriceTableLine(rawLine);
      if (!cleaned) continue;
      const signature = cleaned
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (seen.has(signature)) continue;
      seen.add(signature);
      lines.push(cleaned);
    }
  }

  return lines.length ? [platformDisplayName(platform), "", ...lines].join("\n") : null;
}

function wordNumberToValue(raw: string): number | null {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) return parsePtBrNumber(normalized);
  const map: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, trez: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, vinte: 20, cinquenta: 50, cem: 100,
  };
  return map[normalized] ?? null;
}

function extractRequestedQuantityForProduct(message: string, product: CommerceProduct): number | null {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const productPatterns: Record<CommerceProduct, string> = {
    seguidores: "seguidores?", curtidas: "curtidas?|likes?", visualizacoes: "visualizacoes?|views?",
    inscritos: "inscritos?", plays: "plays?|streams?", ouvintes: "ouvintes?", saves: "saves?|salvamentos?",
    playlist: "playlists?", live: "(?:pessoas\\s+)?live", horas: "horas?", comentarios: "comentarios?",
  };
  const qtyWord = "(\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|trez|quatro|cinco|seis|sete|oito|nove|dez|vinte|cinquenta|cem)";
  const rx = new RegExp(`${qtyWord}\\s*(mil|k)?\\s+(?:de\\s+)?(?:${productPatterns[product]})`, "i");
  const match = normalized.match(rx);
  if (!match) return null;
  const base = wordNumberToValue(match[1]);
  if (base == null) return null;
  return /^(mil|k)$/i.test(match[2] || "") ? base * 1000 : base;
}

function genericPriceForQuantity(rule: GenericPriceRule, quantity: number): number | null {
  if (rule.minQuantity != null && quantity < rule.minQuantity) return null;
  if (rule.maxQuantity != null && quantity > rule.maxQuantity) return null;
  return (quantity / rule.baseQuantity) * rule.basePrice;
}

function productDisplayName(product: CommerceProduct): string {
  const names: Record<CommerceProduct, string> = {
    seguidores: "seguidores", curtidas: "curtidas", visualizacoes: "visualizações", inscritos: "inscritos",
    plays: "plays", ouvintes: "ouvintes", saves: "saves", playlist: "playlist", live: "pessoas na live",
    horas: "horas", comentarios: "comentários",
  };
  return names[product];
}

function buildDeterministicMultiProductPriceReply(params: {
  message: string;
  platform: CommercePlatform;
  moduleKeys: string[];
  modules: Record<string, LoadedModuleV3>;
}): string | null {
  const products = (Object.keys(PRODUCT_PRICE_TERMS) as CommerceProduct[])
    .map((product) => ({ product, quantity: extractRequestedQuantityForProduct(params.message, product) }))
    .filter((item): item is { product: CommerceProduct; quantity: number } => item.quantity != null);

  if (products.length === 0) return null;

  const lines: string[] = [];
  let total = 0;
  for (const item of products) {
    const rules = collectGenericPriceRules({
      platform: params.platform,
      product: item.product,
      moduleKeys: params.moduleKeys,
      modules: params.modules,
    });
    // Se houver uma regra padrão e outra explicitamente Premium, a padrão vence
    // quando o cliente não escolheu variante. Se continuarem várias opções
    // (ex.: Instagram Global + Brasil Promo), não escolhemos por conta própria.
    let usableRules = rules;
    if (usableRules.length > 1) {
      const nonPremium = usableRules.filter((rule) =>
        !/\b(premium|promocional|promo)\b/i.test(rule.label),
      );
      if (nonPremium.length === 1) usableRules = nonPremium;
    }
    if (usableRules.length !== 1) return null;
    const price = genericPriceForQuantity(usableRules[0], item.quantity);
    if (price == null) return null;
    total += price;
    lines.push(`${item.quantity.toLocaleString("pt-BR")} ${productDisplayName(item.product)} fica R$ ${formatBrl(price)}.`);
  }

  if (lines.length > 1) lines.push(`Total: R$ ${formatBrl(total)}.`);
  return lines.join(" ");
}

function enabledCommercialPlatforms(modules: Record<string, LoadedModuleV3>): CommercePlatform[] {
  const platforms: CommercePlatform[] = ["spotify", "youtube", "instagram", "tiktok", "kwai", "facebook"];
  return platforms.filter((platform) =>
    Object.entries(modules).some(([key, module]) => moduleBelongsToPlatform(key, module, platform)),
  );
}

function isGenericInstagramFollowerPriceQuestion(message: string): boolean {
  const normalized = String(message || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const asksFollowers = /seguidor/.test(normalized);
  const asksPrice = /(valor|preco|quanto|custa|fica)|\b\d{2,}\b/.test(normalized);
  const choseVariant = /\b(global|brasil|premium|promocional|promo)\b/.test(normalized);

  return asksFollowers && asksPrice && !choseVariant;
}

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function spotifyPriceFallback(
  product: ConversationProductForPricing,
  rule: ParsedSpotifyPriceRule,
  message: string,
): string {
  const names: Record<ConversationProductForPricing, string> = {
    plays: "Plays + Ouvintes",
    ouvintes: "Plays + Ouvintes",
    saves: "Saves",
    seguidores: "Seguidores",
    playlist: "1 música em 10 playlists",
  };
  if (product === "playlist") {
    return `${names[product]} fica R$ ${formatBrl(rule.basePrice)}.`;
  }

  const requested = [...message.matchAll(/\b([\d.]+)\b/g)]
    .map((match) => parsePtBrNumber(match[1]))
    .find((value): value is number => value != null && value > 0);

  if (
    requested != null &&
    (rule.minQuantity == null || requested >= rule.minQuantity) &&
    (rule.maxQuantity == null || requested <= rule.maxQuantity)
  ) {
    const price = (requested / rule.baseQuantity) * rule.basePrice;
    return `${requested.toLocaleString("pt-BR")} ${names[product]} fica R$ ${formatBrl(price)}.`;
  }

  const baseText = `${rule.baseQuantity.toLocaleString("pt-BR")} ${names[product]} fica R$ ${formatBrl(rule.basePrice)}.`;
  if (rule.minQuantity && rule.minQuantity !== rule.baseQuantity) {
    const minPrice = (rule.minQuantity / rule.baseQuantity) * rule.basePrice;
    return `${baseText} O mínimo é ${rule.minQuantity.toLocaleString("pt-BR")}, por R$ ${formatBrl(minPrice)}.`;
  }
  return baseText;
}

function hasUnsupportedSpotifyPriceClaim(params: {
  response: string;
  moduleContent: string;
  product: ConversationProductForPricing;
  message: string;
}): { invalid: boolean; fallback: string } {
  const rule = parseSpotifyPriceRule(params.moduleContent, params.product);
  if (!rule) return { invalid: true, fallback: "Preciso confirmar o valor correto desse serviço antes de te passar." };

  const responsePrices = [...params.response.matchAll(/R\$\s*([\d.]+(?:,\d+)?)/gi)]
    .map((match) => parsePtBrNumber(match[1]))
    .filter((value): value is number => value != null);
  if (responsePrices.length === 0) {
    return { invalid: false, fallback: spotifyPriceFallback(params.product, rule, params.message) };
  }

  if (params.product === "playlist") {
    const invalid = responsePrices.some((price) => Math.abs(price - rule.basePrice) > 0.011);
    return { invalid, fallback: spotifyPriceFallback(params.product, rule, params.message) };
  }

  const quantities = [
    ...params.response.matchAll(/\b([\d.]{2,})\b/g),
    ...params.message.matchAll(/\b([\d.]{2,})\b/g),
  ]
    .map((match) => parsePtBrNumber(match[1]))
    .filter((value): value is number => value != null && value > 0);

  const allowed = new Set<number>();
  allowed.add(Number(rule.basePrice.toFixed(2)));
  if (rule.minQuantity) {
    allowed.add(Number(((rule.minQuantity / rule.baseQuantity) * rule.basePrice).toFixed(2)));
  }
  for (const quantity of quantities) {
    if (rule.minQuantity != null && quantity < rule.minQuantity) continue;
    if (rule.maxQuantity != null && quantity > rule.maxQuantity) continue;
    allowed.add(Number(((quantity / rule.baseQuantity) * rule.basePrice).toFixed(2)));
  }

  const invalid = responsePrices.some(
    (price) => !Array.from(allowed).some((candidate) => Math.abs(candidate - price) <= 0.011),
  );
  return { invalid, fallback: spotifyPriceFallback(params.product, rule, params.message) };
}

export function hasValidatedCommercialOfferV3(params: {
  platform: ConversationContext["platform"];
  product: ConversationContext["product"];
  moduleKeys: string[];
  modules: Record<string, LoadedModuleV3>;
}): boolean {
  if (!params.platform || !params.product) return false;
  const platform = params.platform as CommercePlatform;
  const product = params.product as CommerceProduct;

  return params.moduleKeys.some((key) => {
    const module = params.modules[key];
    if (!module || !moduleBelongsToPlatform(key, module, platform)) return false;
    const content = module.content || "";
    const matchesProduct =
      module.routing.products.includes(params.product as string) ||
      PRODUCT_PRICE_TERMS[product]?.test(content);
    return matchesProduct && /R\$\s*\d/i.test(content);
  });
}

export interface OrchestratorInput {
  userId: string;
  message: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
  historyTelemetry?: {
    total_messages_stored: number;
    history_truncated: boolean;
    session_reset_reason?: string;
    oldest_message_sent_at?: string;
  };
  enabledModules?: string[];
  customModules?: Record<string, string | LoadedModuleV3>;
  anthropicApiKey: string;
  extraContext?: string;
  rememberedContext?: Partial<Pick<ConversationContext, "platform" | "product">>;
  businessDecision?: BusinessDecisionV3;
  funnelAlreadyCompleted?: boolean;
  customerLifecycle?: "novo_lead" | "interessado" | "negociacao" | "pronto_para_comprar" | "cliente" | "cliente_recorrente";
  repurchasePotential?: "baixo" | "medio" | "alto";
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
  imageSource?: {
    url?: string;
    data?: string;
    mediaType?: string;
  };
  messageId?: string; // Para telemetria
  workspaceId?: string;
  conversationId?: string;
  phone?: string;
  // Quando presente (só quando uma FlowAction está ligada por feature
  // flag), instrui o Claude a apenas ESCREVER a ação já decidida pelo
  // Flow Engine, em vez de decidir o próximo passo sozinho. Ausente na
  // grande maioria das mensagens hoje (todas as flags começam desligadas).
  flowActionHint?: { version: number; action: string; reasonCode: string; reason: string; payload: unknown } | null;
}

export interface ModuleTelemetry {
  key: string;
  name: string;
  chars: number;
  tokens: number;
}

export interface AgentV3TurnResult {
  response: string;
  replies: string[];
  usage: {
    model: string;
    request_id?: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    latency_ms: number;
  };
  cost: {
    input_usd: number;
    output_usd: number;
    cache_usd: number;
    total_usd: number;
  };
  modules: {
    selected_keys: string[];
    versions: Record<string, number>;
    estimated_tokens_by_module: Record<string, number>;
    estimated_chars_by_module: Record<string, number>;
    prompt_tokens_without_commercial: number;
    prompt_tokens_with_commercial: number;
    commercial_tokens_added: number;
    selection_context?: unknown;
    selection_reasons?: Record<string, string>;
  };
  intelligence: {
    temperature: "frio" | "morno" | "quente";
    confidence: string;
    intent: string;
    stage: string;
    purchase_probability: number;
    sentiment: string;
    urgency: string;
    recommended_action: string;
    reasoning: string;
  };
  score?: {
    total?: number;
    humanity?: number;
    clarity?: number;
    conversion?: number;
    persona?: number;
    objectivity?: number;
  };
  rawResponse?: string;
  rawPrompt?: unknown;
}

export type AgentResponseV3 = AgentV3TurnResult;

/**
 * CORE ORCHESTRATOR V3
 * Responsável por:
 * 1. Resolver workspace e carregar módulos do CMS
 * 2. Selecionar módulos relevantes com contexto
 * 3. Construir o system prompt
 * 4. Chamar o LLM
 * 5. Aplicar guards, pós-processamento e telemetria
 */
export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentV3TurnResult> {
  const {
    userId,
    message,
    history,
    historyTelemetry,
    enabledModules,
    customModules,
    anthropicApiKey,
    extraContext,
    rememberedContext,
    businessDecision,
    funnelAlreadyCompleted,
    customerLifecycle,
    repurchasePotential,
    inputKind,
    imageSource,
    messageId,
    workspaceId: inputWorkspaceId,
    conversationId,
    phone,
    flowActionHint,
  } = input;

  // RUN ID — gerado no início do turno, pra correlacionar esse turno
  // específico entre TODOS os logs de diagnóstico (Module Selector,
  // Flow Engine, OrderContext, contagem real de tokens).
  const runId = Math.random().toString(16).slice(2, 8);
  console.log("[RUN-ID]", runId, "— mensagem:", message.slice(0, 80));

  const workspaceId = inputWorkspaceId?.trim();
  if (!workspaceId) {
    throw new Error("[agent-v3] workspaceId é obrigatório; o V3 não usa fallback entre workspaces");
  }


  // 1. Carregar módulos do CMS e aplicar overrides explícitos do chamador.
  const activeModulesMap = await loadEnabledModulesV3(workspaceId);
  const mergedModulesMap: Record<string, LoadedModuleV3> = { ...activeModulesMap };
  for (const [rawKey, customModule] of Object.entries(customModules || {})) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const content = typeof customModule === "string" ? customModule.trim() : customModule.content?.trim();
    if (!content) {
      console.warn(`[agent-v3] Módulo customizado ignorado por estar vazio: ${rawKey}`);
      continue;
    }

    mergedModulesMap[key] =
      typeof customModule === "string"
        ? {
            content,
            source: "custom",
            version: "custom",
            routing: {
              alwaysLoad: false,
              intents: [],
              stages: [],
              platforms: [],
              products: [],
              triggers: [],
              dependencies: [],
              conflicts: [],
              priority: 0,
            },
          }
        : { ...customModule, content, source: "custom" };
  }

  // 2. Respeitar o filtro explícito sem permitir chaves inexistentes.
  const availableKeys = Object.keys(mergedModulesMap);
  const enabledKeys = enabledModules?.length
    ? Array.from(
        new Set(
          enabledModules
            .map((key) => key.trim().toLowerCase())
            .filter((key) => availableKeys.includes(key)),
        ),
      )
    : availableKeys;

  // 3. Selecionar módulos relevantes baseados na mensagem e histórico
  const selectableModules = Object.fromEntries(
    enabledKeys.map((key) => [key, mergedModulesMap[key]]).filter(([, module]) => Boolean(module)),
  );
  const selection = selectModulesV3(message, history, selectableModules, rememberedContext);

  // Log de diagnóstico — módulo por módulo, com motivo exato de cada
  // carregamento (ou rejeição). Não altera nenhum comportamento.
  try {
    logModuleSelectorExecution(
      message,
      selection.context,
      selectableModules,
      selection.selectedModules,
      selection.selectionReasons,
      runId,
    );
  } catch (selectorLogError) {
    console.warn("[MODULE-SELECTOR-LOG] Falha ao gerar log (não bloqueia o fluxo):", selectorLogError);
  }
  const selectedKeys = [...selection.selectedModules];
  if (selectedKeys.length === 0) {
    throw new Error(
      "[agent-v3] Nenhum módulo foi selecionado. Aplique a migration de roteamento e configure os metadados no CMS.",
    );
  }
  const selectionContext = selection.context;
  const selectionReasons = { ...selection.selectionReasons };

  // Módulos autoritativos obrigatórios. Se o contexto já sabe que é Spotify +
  // produto/preço, nunca deixamos o LLM responder sem a fonte correta.
  const spotifyPriceProducts = new Set(["plays", "ouvintes", "saves", "seguidores", "playlist"]);
  const needsSpotifyPriceAuthority =
    selectionContext.platform === "spotify" &&
    (selectionContext.intent === "consulta_preco" ||
      selectionContext.intent === "compra" ||
      selectionContext.stage === "negociacao" ||
      selectionContext.stage === "fechamento" ||
      (selectionContext.product != null && spotifyPriceProducts.has(selectionContext.product)));

  if (needsSpotifyPriceAuthority && selectableModules.spotify_precos && !selectedKeys.includes("spotify_precos")) {
    selectedKeys.push("spotify_precos");
    selectionReasons.spotify_precos = "Autoridade obrigatória de preços Spotify";
  }

  // Para YouTube/Instagram/TikTok/Kwai/Facebook, preço também precisa vir de
  // módulo comercial real. Carregamos módulos da plataforma que contêm R$ e
  // mencionam o produto atual — ou qualquer produto quando a mensagem contém
  // múltiplos SKUs, como "10 mil visualizações e 3 mil curtidas".
  if (selectionContext.platform && selectionContext.platform !== "spotify") {
    const platform = selectionContext.platform as CommercePlatform;
    const requestedProducts = (Object.keys(PRODUCT_PRICE_TERMS) as CommerceProduct[])
      .filter((product) => extractRequestedQuantityForProduct(message, product) != null);
    const productsToAuthorize = requestedProducts.length > 0
      ? requestedProducts
      : selectionContext.product
        ? [selectionContext.product as CommerceProduct]
        : [];
    const needsCommercialAuthority =
      selectionContext.intent === "consulta_preco" ||
      selectionContext.intent === "compra" ||
      selectionContext.intent === "pagamento" ||
      selectionContext.stage === "negociacao" ||
      selectionContext.stage === "fechamento" ||
      productsToAuthorize.length > 0;

    if (needsCommercialAuthority) {
      for (const [key, module] of Object.entries(selectableModules) as Array<[string, LoadedModuleV3]>) {
        if (!moduleBelongsToPlatform(key, module, platform)) continue;
        if (!/R\$\s*\d/i.test(module.content || "")) continue;
        const relevantToProduct =
          productsToAuthorize.length === 0 ||
          productsToAuthorize.some((product) => PRODUCT_PRICE_TERMS[product].test(module.content || ""));
        if (!relevantToProduct || selectedKeys.includes(key)) continue;
        selectedKeys.push(key);
        selectionReasons[key] = `Autoridade comercial obrigatória de ${platform}`;
      }
    }
  }

  const normalizedTurnText = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const asksSpotifyMoney =
    selectionContext.platform === "spotify" &&
    /(?:ganhar|ganho|dinheiro|receber|paga|pagamento|monetiz|royalt|fatur)/i.test(normalizedTurnText);
  if (asksSpotifyMoney && selectableModules.spotify_royalties && !selectedKeys.includes("spotify_royalties")) {
    selectedKeys.push("spotify_royalties");
    selectionReasons.spotify_royalties = "Autoridade obrigatória de royalties/monetização Spotify";
  }

  console.log(
    `[AGENT-V3-SELECTOR] Intent: ${selectionContext.intent}, Stage: ${selectionContext.stage}, Platform: ${selectionContext.platform}, Modules: ${selectedKeys.join(", ")}`,
  );

  // 3.1. Comparativo de Prompt (tokens comerciais)
  const commercialKeys = [
    "psicologia_vendas",
    "objecoes_vendas",
    "fechamento_vendas",
    "recuperacao_leads",
    "qualificacao_lead",
    "fluxo_vendas",
  ];
  const nonCommercialKeys = selectedKeys.filter((k) => !commercialKeys.includes(k));

  const promptWithCommercialResult = buildPromptFromModulesDetailed(selectedKeys, mergedModulesMap);
  const promptWithoutCommercialResult = buildPromptFromModulesDetailed(
    nonCommercialKeys,
    mergedModulesMap,
  );

  if (promptWithCommercialResult.warnings.length > 0) {
    console.warn("[agent-v3] Módulos ignorados durante a montagem do prompt:", promptWithCommercialResult.warnings);
  }

  const promptWithCommercial = promptWithCommercialResult.prompt;
  const promptWithoutCommercial = promptWithoutCommercialResult.prompt;
  const effectiveSelectedKeys = promptWithCommercialResult.includedKeys;

  // A telemetria deve refletir apenas os módulos que realmente entraram no prompt.
  // Chaves descartadas pelo prompt-builder (ausentes ou vazias) não podem aparecer
  // nos tokens estimados, versões ou contagem de módulos usados.
  const modulesTelemetry: ModuleTelemetry[] = effectiveSelectedKeys.map((key) => {
    const mod = mergedModulesMap[key];
    const content = mod?.content || "";
    return {
      key,
      name: mod?.name?.trim() || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      chars: content.length,
      tokens: Math.ceil(content.length / 4),
    };
  });

  if (!promptWithCommercial.trim()) {
    throw new Error("[agent-v3] Os módulos selecionados não produziram conteúdo válido para o prompt");
  }

  const tokensWith = Math.ceil(promptWithCommercial.length / 4);
  const tokensWithout = Math.ceil(promptWithoutCommercial.length / 4);

  const promptComparison = {
    withoutCommercial: tokensWithout,
    withCommercial: tokensWith,
    diff: tokensWith - tokensWithout,
  };

  const modulePrompt = promptWithCommercial;

  const numericModuleVersion = (key: string): number => {
    const parsed = Number(mergedModulesMap[key]?.version);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const isAudioInput = inputKind === "audio";
  const isImageInput = inputKind === "image";
  const isStickerInput = inputKind === "sticker";
  const availableCommercialPlatforms = enabledCommercialPlatforms(selectableModules);
  const currentBrazilDateTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const systemPrompt = [
    {
      type: "text",
      text: `
${MIND_OPERATIONAL_TRUTH_V3}

## P0 — SEGURANÇA E ANTI-INVENÇÃO (nunca flexibilizar)

FONTE ÚNICA DE INFORMAÇÃO COMERCIAL:
- Preço, promoção, prazo, garantia e serviço vêm exclusivamente dos módulos carregados em ESTADO DA CONVERSA. Nunca invente NENHUM desses cinco itens — se um não estiver no módulo, diga que precisa confirmar, ou faça uma pergunta.
- Preço é dado estruturado, nunca estimativa: calcule proporção apenas quando o módulo autorizar explicitamente.
- Nunca diga/insinue que comprar plays/views/seguidores gera royalties, faturamento ou renda diretamente. Perguntas sobre "quanto vou ganhar"/"qual plataforma paga mais": sem módulo específico de monetização, diga que isso varia e é definido pela própria plataforma.
- Memória comercial persistente serve para lembrar quem é o cliente e histórico — nunca é fonte de preço ou característica de produto.
- Não ofereça categoria/plataforma/produto ausente dos módulos carregados. "Tenho interesse" vago → pergunta só rede/serviço, nunca um catálogo inventado.
- Ao comparar variações do mesmo serviço (ex: Global/Premium), compare só o que está escrito no módulo — nunca invente "mais qualificado", "mais seguro" ou vantagem não cadastrada.

NUNCA AFIRME TER VERIFICADO O QUE NÃO VERIFICOU:
- Não diga que analisou, verificou, conferiu ou abriu um link, perfil, música, conta ou pedido. Oriente só pelo formato visível do endereço e pelo que o cliente escreveu.
- Comprovante de pagamento: nunca valide/invalide pelo nome do banco, instituição, recebedor, razão social ou chave Pix (isso varia por banco/gateway). Nunca diga "esse banco não é nosso" só pela imagem. Reconheça que parece comprovante, agradeça, e oriente conferir o saldo no painel — nunca confirme pagamento sem confirmação real do sistema.
- Se saldo/recarga não aparecer após 1 tentativa simples de atualizar, não entre em loop de cache/navegador/ticket — encaminha pro setor responsável.
- Links enviados após "já comprei": não são prova de pedido criado. Use linguagem condicional ("se os pedidos já foram feitos, agora é só aguardar").

CADASTRO DO PAINEL — VERDADE OPERACIONAL:
- Cadastro é só e-mail + senha criada pelo cliente. NUNCA exige biometria, selfie, documento, RG, CNH ou CPF.
- Se o cliente relatar reconhecimento facial/biometria/documento: isso NÃO é da Mind — não confirme como normal, peça print pra entender onde ele está.

ALERTA DE BANCO / TRANSAÇÃO DE RISCO:
- Se o banco do cliente mostrar alerta de risco: não diga que é comum, não invente a causa, não diagnostique o banco. Reconheça a preocupação em 1 frase e dê só a orientação operacional conhecida.

FORMATAÇÃO: texto simples, sem Markdown/asteriscos/títulos com #/negrito. Gere somente a mensagem que será enviada ao cliente — nunca escreva metadados, análise interna, score, intenção, temperatura, justificativa ou marcadores entre colchetes.

## P1 — FLUXO COMERCIAL E CONTINUIDADE (a espinha dorsal da venda)

CONTEXTO ANTES DE PERGUNTAR (regra central — evita repetir pergunta):
- Antes de qualquer pergunta, considere o histórico completo e a memória/estado da conversa. Pergunte SOMENTE o que ainda falta — nunca repita algo que o cliente já disse, mesmo que em mensagem anterior. Isso vale pra plataforma, serviço, quantidade, preço já informado, ou qualquer outro dado já estabelecido.
- Uma saudação dentro de conversa já iniciada NUNCA reinicia o atendimento nem repete apresentação/pergunta "como posso ajudar".
- Depois do funil de boas-vindas concluído, a Júlia já foi apresentada — nunca diga "aqui é a Júlia" de novo nem "bem-vindo".
- Depois que o cliente confirmar pagamento/saldo funcionando ("deu certo", "funcionou"), o pedido já estabelecido (rede, quantidade, link, preço) continua valendo pro resto da conversa — nunca reinicia qualificação, mesmo com mensagem vaga.
- Depois de intenção clara de pagamento, nunca volta pra etapas anteriores de qualificação.
- "Já achei"/"já consegui"/"ok farei aqui" = avanço na etapa, NÃO é confirmação de compra. Só considere venda concluída com confirmação inequívoca ("já comprei", "já paguei", "fiz o pedido").

FLUXO PROGRESSIVO (um passo por vez):
- Rede/plataforma → serviço → quantidade → valor → pagamento/painel.
- Interesse vago → descobre só a rede. Rede informada → descobre só o serviço (não despeja tabela). Serviço escolhido sem quantidade → mostra preço-base e pergunta quantidade.
- Máximo DUAS perguntas de qualificação antes de mostrar preço/tabela — depois disso, mostra valor mesmo faltando detalhe (ajusta depois).
- Cliente com interesse em mais de uma plataforma: foca na primeira mencionada até preço/decisão, só depois pergunta a segunda.
- Cliente vago/incerto ("não sei", "qualquer um"): nunca joga outra pergunta aberta — sugere o ponto de partida mais comum (quantidade mínima do módulo) e deixa ele reagir.
- Pergunta factual específica (ex: "quais são os nomes das playlists") sempre tem prioridade sobre empurrar preço — responde a pergunta exata primeiro, preço pode vir depois em mensagem separada.
- Cliente sem saber o nome do serviço certo (ex: "quero engajar minha música"): recomenda os serviços coerentes entre os módulos carregados, sem devolver catálogo genérico nem perguntar "qual serviço?" de novo.
- Se o cliente corrigir "não é isso" e explicar o objetivo real: abandona a trilha anterior imediatamente, não repete a lista que ele já rejeitou.

LINK — QUANDO PEDIR E COMO VALIDAR:
- Nunca pede link por iniciativa própria. Só pede quando o cliente já decidiu comprar (confirmação clara, tipo "quero começar com essa quantidade?" → "sim"), quando o serviço exigir naquele passo, ou quando o cliente perguntar qual link usar.
- Informar preço NÃO é decisão de compra — depois do preço, a próxima pergunta é uma CONFIRMAÇÃO, nunca pedido de link.
- Se o cliente mandar link espontaneamente, valida só o formato (ex: Spotify Plays precisa de link de faixa /track/, não /user/; YouTube visualizações precisa de link de vídeo, não canal) — sem certeza suficiente, não confirma que está correto.

PAGAMENTO — SINAIS DE FECHAMENTO:
- "Manda o pix"/"quero pagar"/"onde pago" = cliente quer FECHAR. Para de qualificar, conduz direto pro procedimento: acessar painel, cadastro, recarregar via Pix, escolher serviço.
- Nunca pede link como pré-requisito pra fechar/pagar (a menos que módulo específico diga o contrário).

LINK DO PAINEL — FORMATO DE ENVIO:
- Sempre em mensagem própria: instrução curta, depois ===SPLIT===, depois só o endereço do módulo (sem ponto/vírgula/parênteses na mesma linha).

SUPORTE DURANTE FECHAMENTO:
- Não encaminha automaticamente pro suporte quando a resposta já está disponível nos módulos carregados — só encaminha quando genuinamente não tem a informação.
- Cliente tentando cadastrar/pagar continua em FECHAMENTO, não pós-venda. No máximo 1 orientação técnica simples — se continuar bloqueado, não repete "limpe cache"/"tente outro navegador" em loop.

PÓS-VENDA:
- Venda confirmada → modo pós-venda: responde só a dúvida atual, sem voltar a perguntar rede/serviço/quantidade.
- Nunca usa "se der certo"/"tomara" pra prazo dentro do normal — informa o prazo do módulo direto.
- Não inventa causa técnica ("instabilidade do banco", etc) fora dos módulos.

TABELA DE PREÇOS (formato):
- Pedido explícito de tabela/valores → tabela COMPLETA da rede em mensagem isolada (===SPLIT=== antes/depois se tiver texto), 1 linha por serviço, todos os serviços do módulo, sem inventar nenhum.
- Vale pra todas as redes (Spotify, YouTube, Instagram, TikTok, Kwai, Facebook, etc.), não só Spotify.
- Pergunta sobre 1 serviço específico com múltiplas variações (ex: Instagram Seguidores Global/Brasil/Premium): lista TODAS as variações relevantes antes de perguntar qual — nunca escolhe uma silenciosamente, nunca omite uma opção promocional cadastrada. Se existir opção mais barata/promocional compatível, ela aparece junto das demais.

ATENDIMENTO CONSULTIVO:
- "Vou mandar minha música"/"coloca no YouTube" não é necessariamente pedido de views/plays — primeiro diferencia se já está publicada ou se ele quer publicar (a Mind só divulga conteúdo já publicado, salvo módulo dizendo o contrário).
- Erro de digitação óbvio pelo contexto: confirma em 1 pergunta curta em vez de rejeitar a palavra.

ADIAMENTO NATURAL:
- Cliente adiando ("depois", "ocupado agora", "chamo mais tarde"): reconhece e NÃO faz nova pergunta comercial naquele turno. Resposta curta e natural, sem tentar recuperar a venda no mesmo turno.


## P2 — ESTILO E NATURALIDADE (como escrever)

TAMANHO E RITMO:
- Resposta comum: 80–180 caracteres (15–35 palavras). Explicação necessária: até 250 caracteres (~45 palavras). Acima disso, divide em 2-3 mensagens com ===SPLIT===, nunca vira textão.
- 1-2 frases é o padrão. Se a frase já resolveu, para ali. No máximo 1 informação adicional e 1 pergunta por mensagem.
- Responde direto ao que foi perguntado — não antecipa 3 passos à frente, não recapitula preço/prazo/plataforma sem necessidade.

QUANDO USAR ===SPLIT=== (regra única, vale pra todo caso):
- Afirmação seguida de pergunta nova → sempre 2 mensagens, mesmo com texto curto.
- Texto passaria de 250 caracteres → divide em 2-3 mensagens naturais.
- Tabela de preços → mensagem isolada, com ===SPLIT=== separando de texto antes/depois.
- Link do painel → sempre isolado do texto ao redor.

SAUDAÇÃO:
- Primeiro contato: sem emoji, natural e curto. Usa o horário real (Brasil, UTC-3) pra "bom dia/boa tarde/boa noite" — nunca chuta "boa noite" por padrão. Preserva o período que o cliente usar.
- Evita "Bem-vindo à Mind" e frases publicitárias.

NATURALIDADE (evitar cara de robô/SAC):
- Varia a abertura — não começa toda resposta com "Perfeito!"/"Ótimo!"/"Claro!". Não transforma toda resposta em pergunta quando o próximo passo já está claro.
- Evita encerramento repetitivo ("qualquer dúvida é só chamar", "fico por aqui", "boa sorte", "sucesso na compra") — raro, não em toda mensagem.
- Não elogia automaticamente quantidade/música/link.
- Acompanha informalidade leve do cliente ("kkk", "blz") sem caricaturar; nunca debocha ou usa informalidade excessiva que possa constranger.
- Nunca afirma ser humana; se pedirem outro atendente ou "sem ser robô", o runtime encaminha — não discute identidade.
- Interpreta pelo contexto antes do sentido literal (ex: "o que está no seu comercial?" = "o que vocês oferecem?").
- Emoji opcional, no máximo 1, só quando fizer sentido.
- "ok", "beleza", "entendi" e reações do cliente podem encerrar naturalmente um microtrecho — não force continuação.

${isAudioInput ? `MODO ÁUDIO:
- O cliente enviou áudio, mas isso NÃO significa que a resposta também será em áudio.
- Responda normalmente e de forma curta.
- Respostas simples, preços, confirmações e perguntas objetivas devem funcionar bem em texto.
- Quando a dúvida exigir uma explicação maior, várias etapas ou contexto técnico, escreva uma resposta natural que também fique boa se narrada.
- O runtime decide automaticamente se envia texto ou nota de voz.
- Se o áudio estiver ininteligível, peça para enviar novamente ou escrever.` : ""}
${isImageInput ? `MODO VISÃO:
- A imagem real está anexada nesta mensagem.
- Analise a imagem diretamente antes de responder.
- Nunca diga que não consegue visualizar se a imagem foi fornecida.
- Use textos, erros, telas, comprovantes, perfis, postagens ou outros detalhes visíveis para responder no contexto.
- Em comprovantes, reconhecer texto visível NÃO autoriza decidir se o banco/recebedor pertence ou não à Mind; siga a REGRA CRÍTICA DE COMPROVANTE.
- Não invente detalhes que não estejam visíveis.
- Responda de forma curta e natural.` : ""}
${isStickerInput ? `FIGURINHA: Se o cliente mandou figurinha, agradeça ou ignore se não fizer sentido na conversa.` : ""}`,
      cache_control: { type: "ephemeral" }
    },
    {
      type: "text",
      text: `
HORÁRIO DE REFERÊNCIA DO ATENDIMENTO (Brasil / America/Sao_Paulo): ${currentBrazilDateTime}

PLATAFORMAS DISPONÍVEIS NO CMS:
${availableCommercialPlatforms.length > 0 ? availableCommercialPlatforms.join(", ") : "nenhuma identificada"}
- Esta lista serve SOMENTE para confirmar se a Mind trabalha ou não com uma plataforma.
- Nunca diga que uma plataforma acima não é oferecida. Para serviços e preços, continue usando apenas os módulos carregados abaixo.

ESTADO DA CONVERSA:
${modulePrompt}

${
  flowActionHint
    ? `## AÇÃO OBRIGATÓRIA — DECIDIDA PELO SISTEMA (prioridade máxima, sobrepõe qualquer regra de fluxo do bloco anterior)
${JSON.stringify({ version: flowActionHint.version, flowAction: flowActionHint.action, reasonCode: flowActionHint.reasonCode, payload: flowActionHint.payload }, null, 2)}

Isso substitui QUALQUER instrução de "descobrir próximo passo", "fluxo progressivo" ou "qualificação" do bloco de regras — ignore essas regras de decisão nesta mensagem específica. O Flow Engine já decidiu determinísticamente. Sua única tarefa é transformar "flowAction" em uma mensagem natural e curta, no tom da Júlia, seguindo as regras de ESTILO. Use "payload" pra não perguntar de novo o que já está preenchido. Nunca escolha uma ação diferente de "flowAction", mesmo que pareça fazer mais sentido — o sistema já decidiu com base em dados que você não vê diretamente.`
    : extraContext
      ? `FATO TÉCNICO:
${extraContext}`
      : ""
}`,
    },
  ];

  // Não substitua a resposta do LLM por uma mensagem comercial fixa quando houver repetição.
  // O detector apenas adiciona uma orientação de concisão, preservando os módulos do CMS
  // como fonte única e evitando respostas inventadas ou links fora do contexto.
  const verboseLoopDetected =
    history.length > 0 &&
    detectVerboseLoop(
      history.map((m) => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content })),
    );

  if (verboseLoopDetected) {
    console.log("[AGENT-V3-DEBUG] Verbose loop detected for user:", userId);
    systemPrompt.push({
      type: "text",
      text: `ANTI-LOOP:
- Não repita explicações, listas ou chamadas para ação já enviadas.
- Responda apenas ao último pedido do cliente em no máximo 2 frases.
- Não invente link, preço, serviço ou etapa; use somente os módulos carregados.`,
      cache_control: { type: "ephemeral" },
    } as any);
  }

  // Model Call
  const system_prompt_chars = JSON.stringify(systemPrompt).length;
  const history_chars = JSON.stringify(history).length;
  const history_summary =
    history.length > 0
      ? history
          .slice(-3)
          .map((m) => `[${m.role.toUpperCase()}: ${m.content.slice(0, 30)}...]`)
          .join(" | ")
      : "empty";
  const message_chars = message.length;

  const currentUserContent: unknown =
    isImageInput && imageSource
      ? [
          imageSource.data
            ? {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageSource.mediaType || "image/jpeg",
                  data: imageSource.data,
                },
              }
            : {
                type: "image",
                source: {
                  type: "url",
                  url: imageSource.url,
                },
              },
          {
            type: "text",
            text:
              message && message !== "[imagem recebida]"
                ? message
                : "Analise a imagem enviada e responda de acordo com o contexto da conversa.",
          },
        ]
      : message;

  const model = isImageInput ? "claude-sonnet-5" : "claude-haiku-4-5";

  // ===========================================================================
  // REGRA DE OURO: PRIORIDADE FACTUAL VS COMERCIAL
  // Se o cliente faz uma pergunta factual específica (ex: nomes de playlists,
  // como funciona um serviço, prova social) e ao mesmo tempo demonstra interesse
  // comercial (preço/compra), a resposta DEVE priorizar a informação factual.
  // Empurrar a tabela de preço antes de tirar a dúvida gera desconfiança.
  // ===========================================================================
  const normalizedCustomerMessage = message.toLocaleLowerCase("pt-BR");
  const factualTriggers = [
    "quais sao", "quais as", "quais os", "qual o nome", "nome de", "nome das",
    "como funciona", "como e feito", "como voces fazem", "e seguro", "e confiavel",
    "tem prova", "tem print", "tem depoimento", "me mostra", "mostra um",
  ];
  const isSpecificFactualQuery = factualTriggers.some(trigger =>
    normalizedCustomerMessage.includes(trigger)
  );

  const shouldSuppressCommercialContext =
    isSpecificFactualQuery &&
    !selectionContext.hasQuantity &&
    selectionContext.intent !== "pagamento";

  const finalModulePrompt = shouldSuppressCommercialContext ? promptWithoutCommercial : promptWithCommercial;

  // FONTE ÚNICA DO SYSTEM PROMPT: ajusta o conteúdo do módulo na MESMA variável
  // systemPrompt (nunca reconstrói um segundo array em paralelo). Isso elimina
  // a possibilidade de systemPrompt e o que realmente vai pro Claude divergirem.
  if (finalModulePrompt !== modulePrompt) {
    systemPrompt[1].text = (systemPrompt[1].text as string).split(modulePrompt).join(finalModulePrompt);
  }

  // RUN ID já foi gerado no início da função — reutilizado aqui pra
  // correlacionar com o log de tokens reais.

  // Contagem REAL de tokens (não estimativa por caractere) — usa o
  // endpoint gratuito de contagem da Anthropic. Diagnóstico apenas, não
  // bloqueia o fluxo se falhar.
  try {
    const { countAnthropicTokensV3 } = await import("./integrations/llm-client.server");
    const realKey = anthropicApiKey || (typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined);
    const [tokensAntesModulos, tokensDepoisModulos] = await Promise.all([
      countAnthropicTokensV3({
        apiKey: realKey,
        system: [systemPrompt[0]],
        messages: [{ role: "user", content: message }],
        model,
      }),
      countAnthropicTokensV3({
        apiKey: realKey,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
        model,
      }),
    ]);
    console.log("[TOKENS-REAIS]", runId, {
      antesModulos: tokensAntesModulos,
      depoisModulos: tokensDepoisModulos,
      modulosAdicionaramReal: tokensAntesModulos != null && tokensDepoisModulos != null
        ? tokensDepoisModulos - tokensAntesModulos
        : "n/d",
    });
  } catch (tokenCountError) {
    console.warn("[TOKENS-REAIS] Falha na contagem real (não bloqueia o fluxo):", tokenCountError);
  }

  const startLlm = Date.now();
  const llmResult = await callAnthropicV3({
    apiKey:
      anthropicApiKey ||
      (typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined),
    system: systemPrompt,

    messages: [
      ...history.map((m) => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: currentUserContent },
    ],
    model,


    metadata: {
      message_id: messageId,
      call_number: 1,
      selectedKeys: effectiveSelectedKeys,
      system_prompt_chars,
      history_chars,
      history_summary,
      message_chars,
      history_telemetry: historyTelemetry,
    },
  });

  const rawText = extractAnthropicTextV3(llmResult);
  if (!rawText) {
    throw new Error("[agent-v3] A Anthropic retornou uma resposta sem conteúdo de texto");
  }
  const latency_ms = Date.now() - startLlm;

  // ============================================================
  // AUDITORIA DE TOKENS (fase de observação — não altera nenhuma
  // lógica, nenhuma resposta, nenhum fluxo. Só registra.)
  // ============================================================
  try {
    const CHARS_PER_TOKEN_ESTIMATE = 4; // aproximação — só pra quebra por categoria

    const businessDecisionText = businessDecision ? businessDecisionToPromptV3(businessDecision) : "";
    const businessDecisionChars = businessDecisionText.length;

    // extraContext hoje mistura customerMemory + businessDecision já unidos
    // antes de chegar aqui — isolamos businessDecision e tratamos o resto
    // (customerMemory) como parte da mesma categoria "Business" por ora,
    // já que não chegam separados nesta função.
    const extraContextChars = (extraContext || "").length;

    // conversationFacts e orderContext ainda NÃO são injetados no prompt
    // hoje (confirmado: não aparecem em nenhum lugar do system prompt
    // atual) — ficam com 0 tokens, de propósito, refletindo a realidade.
    const conversationFactsChars = 0;
    const orderContextChars = 0;

    const modulePromptChars = (finalModulePrompt || "").length;
    const systemPromptFullChars = JSON.stringify(systemPrompt).length;
    // O texto fixo (regras P0/P1/P2 etc.) é o total menos o que é módulo
    // e menos o extraContext — ambos já estão embutidos no mesmo texto.
    const systemPromptFixedChars = Math.max(
      0,
      systemPromptFullChars - modulePromptChars - extraContextChars,
    );

    const historyCharsForAudit = JSON.stringify(history).length;
    const userMessageChars = message.length;

    // Histórico quebrado por profundidade — revela se o histórico está
    // pesando mais do que o esperado em algum ponto específico.
    const historyDepthBreakdown = [1, 5, 10, 20].map((depth) => {
      const slice = history.slice(-depth);
      const chars = JSON.stringify(slice).length;
      return { depth, messages: slice.length, chars, tokensEstimate: Math.round(chars / 4) };
    });

    const toTokenEstimate = (chars: number) => Math.round(chars / CHARS_PER_TOKEN_ESTIMATE);

    const realInputTokens = (llmResult as any)?.usage?.input_tokens ?? null;
    const realOutputTokens = (llmResult as any)?.usage?.output_tokens ?? null;

    console.log(`
=========================
TOKEN BREAKDOWN
=========================
System Prompt (regras fixas):
${toTokenEstimate(systemPromptFixedChars)} tokens (estimado, ${systemPromptFixedChars} chars)
History:
${toTokenEstimate(historyCharsForAudit)} tokens (estimado, ${historyCharsForAudit} chars)
Modules:
${toTokenEstimate(modulePromptChars)} tokens (estimado, ${modulePromptChars} chars)
Business (businessDecision + customerMemory):
${toTokenEstimate(extraContextChars)} tokens (estimado, ${extraContextChars} chars) [businessDecision sozinho: ${toTokenEstimate(businessDecisionChars)} tokens]
Order Context:
${toTokenEstimate(orderContextChars)} tokens (ainda não injetado no prompt)
Conversation Facts:
${toTokenEstimate(conversationFactsChars)} tokens (ainda não injetado no prompt)
User:
${toTokenEstimate(userMessageChars)} tokens (estimado, ${userMessageChars} chars)
-------------------------
Output:
${realOutputTokens ?? "n/d"} tokens (REAL, retornado pela API)
-------------------------
TOTAL REAL (input, retornado pela API):
${realInputTokens ?? "n/d"} tokens
TOTAL ESTIMADO (soma das categorias acima):
${toTokenEstimate(systemPromptFixedChars + historyCharsForAudit + modulePromptChars + extraContextChars + userMessageChars)} tokens
=========================
NÚMEROS BRUTOS (caracteres, sem estimativa de token):
systemPrompt.length (texto puro): ${(systemPrompt[0] as any)?.text?.length ?? "n/d"}
JSON.stringify(systemPrompt).length: ${systemPromptFullChars}
modulePrompt.length (finalModulePrompt): ${modulePromptChars}
=========================
MÓDULOS CARREGADOS NESTE TURNO (${effectiveSelectedKeys.length} total):
${effectiveSelectedKeys.join(", ") || "(nenhum)"}
=========================
HISTÓRICO POR PROFUNDIDADE:
${historyDepthBreakdown.map((h) => `Últimas ${h.depth} (${h.messages} reais): ${h.tokensEstimate} tokens (${h.chars} chars)`).join("\n")}
=========================`);
  } catch (tokenAuditError) {
    console.warn("[TOKEN-AUDIT] Falha ao gerar breakdown (não bloqueia o fluxo):", tokenAuditError);
  }

  // Calculate cost based on llm-client logic but normalized
  const usageRaw = llmResult.usage || {};
  const input_tokens = usageRaw.input_tokens || 0;
  const output_tokens = usageRaw.output_tokens || 0;
  const cache_creation_input_tokens = usageRaw.cache_creation_input_tokens || 0;
  const cache_read_input_tokens = usageRaw.cache_read_input_tokens || 0;

  const pricing =
    model === "claude-sonnet-5"
      ? { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
      : { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };

  const input_usd = (input_tokens * pricing.input) / 1_000_000;
  const output_usd = (output_tokens * pricing.output) / 1_000_000;
  const cache_write_usd = (cache_creation_input_tokens * pricing.cacheWrite) / 1_000_000;
  const cache_read_usd = (cache_read_input_tokens * pricing.cacheRead) / 1_000_000;
  const cache_usd = cache_write_usd + cache_read_usd;
  const total_usd = input_usd + output_usd + cache_usd;

  // A inteligência comercial é derivada do contexto já calculado pelo selector.
  // Isso evita pagar tokens de saída para o LLM gerar metadados que nunca são enviados ao cliente.
  const intentMap: Record<string, string> = {
    saudacao: "Saudação",
    descoberta: "Informação",
    consulta_preco: "Pesquisa",
    compra: "Compra",
    duvida_seguranca: "Informação",
    pagamento: "Pagamento",
    suporte: "Suporte",
    pos_compra: "Pós-venda",
    recuperacao: "Pós-venda",
    encerramento: "Outro",
    desconhecido: "Outro",
  };
  const stageMap: Record<string, string> = {
    inicio: "Primeiro contato",
    qualificacao: "Qualificação",
    apresentacao: "Descoberta",
    negociacao: "Negociação",
    fechamento: "Fechamento",
    pos_venda: "Pós-venda",
    suporte: "Pós-venda",
  };
  const confidence =
    selectionContext.confidence >= 0.85
      ? "Muito alta"
      : selectionContext.confidence >= 0.7
        ? "Alta"
        : selectionContext.confidence >= 0.55
          ? "Média"
          : selectionContext.confidence >= 0.4
            ? "Baixa"
            : "Muito baixa";

  // normalizedCustomerMessage já foi inicializado no topo do bloco de LLM call.
  const normalizedCurrentTurn = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const recentCustomerMessages = history
    .filter((m) => m.role === "customer")
    .slice(-3)
    .map((m) =>
      String(m.content || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    );

  const recentCustomerJourneyText = [...recentCustomerMessages, normalizedCurrentTurn]
    .filter(Boolean)
    .join(" ");

  // A mensagem ATUAL tem precedência sobre o histórico. Isso impede um problema
  // antigo ("não consigo pagar", "desisti") de contaminar um novo turno como
  // "agora consegui" ou "quero comprar novamente".
  const currentResolutionSignal =
    /\b(agora (?:deu certo|funcionou|consegui|apareceu)|ja (?:deu certo|funcionou|consegui|achei)|consegui agora|resolvid[oa]|deu certo|funcionou|apareceu o saldo)\b/.test(normalizedCurrentTurn);
  const currentNewPurchaseSignal =
    /\b(quero comprar|quero fazer|vou comprar|vou fazer|manda o pix|qual o pix|onde pago|quero pagar|mais \d+|outro pedido|nova compra)\b/.test(normalizedCurrentTurn);

  const criticalComplaintCurrent =
    /(?:denuncia|procon|advogad|process|justica|bloquead|nao resolvem|nao respondem|sem acesso ao suporte|nao consigo acessar o suporte|perdi quase todos|conta restrita|restricao)/i.test(normalizedCurrentTurn);
  const criticalComplaintContext =
    !currentResolutionSignal &&
    !currentNewPurchaseSignal &&
    normalizedCurrentTurn.length <= 40 &&
    /(?:denuncia|procon|advogad|process|justica|bloquead|nao resolvem|nao respondem|sem acesso ao suporte|perdi quase todos|conta restrita|restricao)/i.test(recentCustomerJourneyText);
  const criticalComplaintSignal = criticalComplaintCurrent || criticalComplaintContext;

  const paymentTopicCurrent =
    /\b(cadastro|cadastrar|pix|pagamento|recarga|saldo|finalizar|finalizo|finaliza|pedido)\b/.test(normalizedCurrentTurn);
  const technicalProblemCurrent =
    /\b(nao funciona|nao abre|nao aparece|nao completa|nao consigo|nao avanca|erro|trav|volta para|volta a|muito complicado|nao finaliza|nao finalizo)\b/.test(normalizedCurrentTurn);
  const paymentTechnicalBlock =
    !currentResolutionSignal &&
    !currentNewPurchaseSignal &&
    (
      (paymentTopicCurrent && technicalProblemCurrent) ||
      (
        normalizedCurrentTurn.length <= 35 &&
        technicalProblemCurrent &&
        /\b(cadastro|cadastrar|pix|pagamento|recarga|saldo|finalizar|pedido)\b/.test(recentCustomerJourneyText)
      )
    );

  const abandonmentSignal =
    /\b(deixa pra la|deixa para la|desisti|nao quero mais|esquece|vou desistir|vou deixar pra outra hora|vou deixar para outra hora)\b/.test(normalizedCurrentTurn);

  const publicationAmbiguity =
    /\b(mandar (?:a )?musica|manda (?:a )?musica|coloca (?:a )?musica|postar (?:a )?musica|onde mando|mandar por ai)\b/.test(normalizedCurrentTurn);

  let purchase_probability = 20;
  if (selectionContext.intent === "consulta_preco") purchase_probability = 50;
  if (selectionContext.hasGrowthGoal) purchase_probability = Math.max(purchase_probability, 45);
  if (selectionContext.intent === "descoberta" && selectionContext.platform && selectionContext.product) purchase_probability = Math.max(purchase_probability, 45);
  if (selectionContext.intent === "compra") purchase_probability = selectionContext.hasQuantity ? 80 : 70;
  if (selectionContext.intent === "pagamento") purchase_probability = 90;
  if (selectionContext.hasPaidSignal) purchase_probability = 95;
  if (selectionContext.intent === "suporte" || selectionContext.intent === "pos_compra") purchase_probability = 25;

  if (selectionContext.platform && selectionContext.product && selectionContext.hasQuantity && selectionContext.intent !== "suporte" && selectionContext.intent !== "pos_compra") {
    purchase_probability = Math.max(purchase_probability, 78);
  }
  if (selectionContext.hasPaymentSignal && selectionContext.intent !== "suporte") purchase_probability = Math.max(purchase_probability, 90);

  const purchaseConfirmedThisTurn = isConfirmedPurchaseMessage(message);
  const hasExistingCustomerMemory = customerLifecycle === "cliente" || customerLifecycle === "cliente_recorrente";
  const currentIsPostSale = purchaseConfirmedThisTurn || selectionContext.intent === "suporte" || selectionContext.intent === "pos_compra";

  // Cliente antigo pode estar fazendo uma NOVA compra. Memória de cliente não deve
  // transformar automaticamente todo novo fechamento em Pós-venda/100%.
  if (purchaseConfirmedThisTurn) purchase_probability = 100;
  else if (hasExistingCustomerMemory && currentIsPostSale) {
    purchase_probability = Math.max(
      purchase_probability,
      repurchasePotential === "alto" ? 90 : repurchasePotential === "medio" ? 70 : 55,
    );
  }

  if (criticalComplaintSignal) purchase_probability = Math.min(purchase_probability, 20);
  if (paymentTechnicalBlock && !currentIsPostSale) purchase_probability = Math.max(purchase_probability, 90);
  if (abandonmentSignal) purchase_probability = Math.min(purchase_probability, 35);

  let temperature: "frio" | "morno" | "quente" =
    criticalComplaintSignal ? "frio" : purchase_probability >= 75 ? "quente" : purchase_probability >= 40 ? "morno" : "frio";

  let intent = criticalComplaintSignal
    ? "Reclamação"
    : abandonmentSignal
      ? "Abandono da compra"
      : paymentTechnicalBlock && !currentIsPostSale
        ? "Compra"
        : publicationAmbiguity && selectionContext.intent === "desconhecido"
          ? "Divulgação musical"
          : currentIsPostSale
            ? (selectionContext.intent === "suporte" ? "Suporte" : "Pós-venda")
            : intentMap[selectionContext.intent] || "Outro";

  let stage = criticalComplaintSignal
    ? "Pós-venda"
    : abandonmentSignal
      ? "Pagamento interrompido"
      : paymentTechnicalBlock && !currentIsPostSale
        ? "Pagamento / Compra bloqueada"
        : publicationAmbiguity && selectionContext.intent === "desconhecido"
          ? "Descoberta"
          : currentIsPostSale
            ? "Pós-venda"
            : stageMap[selectionContext.stage] || "Descoberta";

  let sentiment = criticalComplaintSignal || paymentTechnicalBlock || abandonmentSignal ||
    /(?:problema|erro|golpe|atras|não chegou|nao chegou|reclama|ruim|péssim|pessim|frustr)/i.test(normalizedCustomerMessage)
    ? "Negativo"
    : /(?:obrigad|valeu|ótimo|otimo|perfeito|show|top)/i.test(normalizedCustomerMessage)
      ? "Positivo"
      : "Neutro";

  const paymentExplicitlyDeferred = /\b(amanha|mais tarde|depois|outro dia|quando der)\b/.test(recentCustomerJourneyText);
  let urgency = criticalComplaintSignal || paymentTechnicalBlock || abandonmentSignal
    ? "Alta"
    : selectionContext.hasPaymentSignal || selectionContext.hasPaidSignal
      ? paymentExplicitlyDeferred ? "Média" : "Alta"
      : selectionContext.hasPurchaseSignal || selectionContext.hasGrowthGoal
        ? "Média"
        : "Baixa";

  let recommended_action = criticalComplaintSignal
    ? "Encaminhar ao setor responsável e manter o agente pausado."
    : paymentTechnicalBlock && !currentIsPostSale
      ? "Venda bloqueada por problema técnico: evitar loop de troubleshooting e encaminhar se persistir."
      : abandonmentSignal
        ? "Cliente interrompeu o fechamento; não pressionar e revisar o motivo do abandono."
        : currentIsPostSale
          ? `Atender o pós-venda sem reiniciar qualificação. Potencial de recompra: ${repurchasePotential || "não definido"}.`
          : selectionContext.intent === "pagamento"
            ? "Orientar o pagamento usando apenas as informações do módulo carregado."
            : selectionContext.intent === "compra"
              ? "Conduzir para o próximo passo da compra sem repetir informações."
              : "Responder diretamente ao último pedido do cliente.";

  // LEAD INTELLIGENCE AUTORITATIVO
  // Evidências comerciais objetivas prevalecem sobre uma classificação semântica
  // fraca. Um cliente que já escolheu plataforma/produto e envia o link correto
  // não pode voltar para "Frio / Outro / Qualificação / 20%".
  const currentContainsPlatformLink =
    /https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|artist|playlist)\//i.test(message) ||
    /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(message) ||
    /https?:\/\/(?:www\.)?instagram\.com\//i.test(message) ||
    /https?:\/\/(?:www\.)?tiktok\.com\//i.test(message);

  const objectiveClosingEvidence =
    currentContainsPlatformLink &&
    Boolean(selectionContext.platform) &&
    Boolean(selectionContext.product) &&
    selectionContext.intent !== "suporte" &&
    selectionContext.intent !== "pos_compra";

  if (objectiveClosingEvidence) {
    purchase_probability = Math.max(purchase_probability, 85);
    temperature = "quente";
    intent = "Compra";
    stage = selectionContext.hasPaymentSignal ? "Pagamento" : "Fechamento";
    urgency = "Média";
    if (sentiment === "Neutro") sentiment = "Positivo";
    recommended_action =
      "Cliente já escolheu plataforma/produto e enviou o link. Avançar para fechamento/pagamento sem voltar a qualificar.";
  }

  // O motor de estado roda ANTES do LLM. Seus estados comerciais são superiores
  // ao fallback do selector para a telemetria salva no painel.
  if (businessDecision) {
    switch (businessDecision.state) {
      case "orcamento":
        purchase_probability = Math.max(purchase_probability, 50);
        temperature = purchase_probability >= 75 ? "quente" : "morno";
        intent = "Pesquisa";
        stage = "Negociação";
        break;
      case "fechamento":
        purchase_probability = Math.max(purchase_probability, 85);
        temperature = "quente";
        intent = "Compra";
        stage = "Fechamento";
        urgency = urgency === "Baixa" ? "Média" : urgency;
        break;
      case "pagamento":
        purchase_probability = Math.max(purchase_probability, 90);
        temperature = "quente";
        intent = "Pagamento";
        stage = "Pagamento";
        urgency = "Alta";
        break;
      case "compra_bloqueada":
        purchase_probability = Math.max(purchase_probability, 90);
        temperature = "quente";
        intent = "Compra";
        stage = "Pagamento / Compra bloqueada";
        sentiment = "Negativo";
        urgency = "Alta";
        break;
      case "pedido_realizado":
        purchase_probability = 100;
        temperature = "quente";
        intent = "Pós-venda";
        stage = "Pós-venda";
        break;
      case "pos_venda":
        intent = "Pós-venda";
        stage = "Pós-venda";
        purchase_probability = Math.max(
          purchase_probability,
          repurchasePotential === "alto" ? 90 : repurchasePotential === "medio" ? 70 : 55,
        );
        temperature = purchase_probability >= 75 ? "quente" : "morno";
        break;
      case "reclamacao":
        purchase_probability = Math.min(purchase_probability, 20);
        temperature = "frio";
        intent = "Reclamação";
        stage = "Pós-venda";
        sentiment = "Negativo";
        urgency = "Alta";
        break;
      case "abandono":
        purchase_probability = Math.min(purchase_probability, 35);
        intent = "Abandono da compra";
        stage = "Pagamento interrompido";
        sentiment = "Negativo";
        urgency = "Alta";
        break;
      case "adiado":
        intent = intent === "Outro" ? "Informação" : intent;
        stage = "Aguardando cliente";
        urgency = "Baixa";
        break;
      case "aguardando_setor":
        sentiment = sentiment === "Positivo" ? "Neutro" : sentiment;
        urgency = "Alta";
        break;
      default:
        break;
    }

    if (businessDecision.waitingCustomer) {
      stage = "Aguardando cliente";
      urgency = "Baixa";
      recommended_action = "Aguardar nova mensagem do cliente sem enviar nova oferta ou pergunta.";
    } else {
      recommended_action = businessDecision.nextAction || recommended_action;
    }
  }

  const reasoning = `Contexto atual ${selectionContext.intent}/${selectionContext.stage}; estadoRuntime=${businessDecision?.state || "n/a"}; memória=${customerLifecycle || "lead"}; bloqueioPagamento=${paymentTechnicalBlock}; reclamaçãoCrítica=${criticalComplaintSignal}; evidenciaFechamento=${objectiveClosingEvidence}.`;
  const conversation_score = Math.max(0, Math.min(100, Math.round(selectionContext.confidence * 100)));

  // Guards & Pipeline
  let finalContent = rawText.trim();
  if (!finalContent) {
    throw new Error("[agent-v3] A Anthropic retornou uma resposta vazia");
  }
  finalContent = sanitizeSystemLeaks(finalContent);

  // Emoji handling
  const agentHistory = history.map((m) => ({
    sender: m.role === "agent" ? "agente" : "cliente",
    body: m.content,
  }));
  finalContent = limitEmojiFrequency(finalContent, agentHistory);

  // Post-processing
  finalContent = humanizePunctuationV3(finalContent);
  finalContent = stripMarkdownFormattingV3(finalContent).trim();

  // Guard determinístico: a atendente nunca deve alegar ser humana para impedir handoff.
  if (/\b(?:eu\s+)?sou\s+humana\b/i.test(finalContent) || /\bn[aã]o\s+sou\s+(?:um\s+)?rob[oô]\b/i.test(finalContent)) {
    finalContent = "Claro. Vou encaminhar seu atendimento para o setor responsável.";
  }

  // Guard operacional do cadastro: mesmo que o modelo ignore o prompt, nunca pode
  // confirmar reconhecimento facial/biometria/documentos como requisito da Mind.
  const customerMentionsUnknownIdentityStep =
    /\b(reconhecimento facial|biometria|selfie|rg|cnh|documento|cpf|identidade)\b/i.test(message);
  const responseConfirmsUnknownIdentityStep =
    /\b(?:reconhecimento facial|biometria|selfie|documento|rg|cnh|cpf)\b/i.test(finalContent) &&
    /\b(?:seguran[çc]a do painel|[ée] (?:do|da) (?:painel|mind)|obrigat[oó]ri[oa]|precisa|necess[aá]ri[oa]|posiciona|c[aâ]mera|ilumina[çc][aã]o|sem [oó]culos|fa[çc]a o reconhecimento)\b/i.test(finalContent);

  if (customerMentionsUnknownIdentityStep && responseConfirmsUnknownIdentityStep) {
    console.error("[AGENT-V3-OPERATIONAL-GUARD] Requisito de identidade inventado foi bloqueado", {
      message,
      response: finalContent,
    });
    finalContent =
      "O cadastro da Mind é feito somente com e-mail e uma senha criada por você. Reconhecimento facial, biometria ou envio de documento não fazem parte do nosso cadastro. Se essa tela apareceu aí, me manda um print que eu te ajudo a identificar onde você está.";
  }

  // Guard de alerta bancário: não diagnosticar nem normalizar um aviso de "alto risco".
  // A Júlia acolhe a preocupação e orienta somente com fatos operacionais conhecidos.
  const bankRiskWarningContext =
    /\b(alto risco|transa(?:cao|ção) de risco|pagamento de risco|banco.*(?:alertou|avisou|informou)|(?:alerta|aviso).*banco)\b/i.test(message);
  const inventsBankRiskExplanation =
    /\b(?:isso (?:e|é) comum|normal acontecer|bancos? (?:sao|são) mais rigorosos|plataformas? de servi[cç]os digitais|autoriza(?:r|ção) manualmente|problema de conex[aã]o|sincroniza[cç][aã]o)\b/i.test(finalContent);

  if (bankRiskWarningContext && inventsBankRiskExplanation) {
    console.error("[AGENT-V3-PAYMENT-GUARD] Explicação bancária sem fonte foi bloqueada", {
      message,
      response: finalContent,
    });
    finalContent =
      "Entendo sua preocupação. Eu não consigo afirmar o motivo desse alerta do seu banco. Se o pagamento não concluir ou você não se sentir seguro para continuar, vou encaminhar para o setor responsável verificar com você.";
  }

  // Guard determinístico de comprovante: nunca rejeitar Pix por nome de banco,
  // recebedor ou razão social visível na imagem.
  const paymentProofContext =
    isImageInput ||
    /\b(comprovante|pix|transfer[êe]ncia|paguei|pagamento|recarga)\b/i.test(message) ||
    history
      .filter((m) => m.role === "customer")
      .slice(-3)
      .some((m) => /\b(comprovante|pix|transfer[êe]ncia|paguei|pagamento|recarga)\b/i.test(m.content));

  const responseRejectsProofByRecipient =
    /\b(?:esse|este|o)\s+(?:pix|comprovante|pagamento|banco|recebedor)\b[^.!?]{0,120}\b(?:n[aã]o [ée] (?:da|do|nosso|nossa)|n[aã]o pertence|empresa errada|recebedor errado|banco errado)\b/i.test(finalContent) ||
    /\b(?:tcr|raz[aã]o social|nome do recebedor|nome do banco|institui[çc][aã]o)\b[^.!?]{0,100}\b(?:n[aã]o [ée] (?:a|da|do) mind|n[aã]o [ée] nosso|errad[oa])\b/i.test(finalContent);

  if (paymentProofContext && responseRejectsProofByRecipient) {
    console.error("[AGENT-V3-PAYMENT-GUARD] Rejeição de comprovante por recebedor/banco foi bloqueada", {
      message,
      response: finalContent,
    });
    finalContent =
      "Obrigada pela compra. Não vou validar o pagamento pelo nome do banco ou recebedor, porque esses dados podem variar. Confira se o saldo apareceu no painel e, quando aparecer, é só fazer o pedido. Se o saldo não aparecer, me avise.";
  }

  if (!finalContent) {
    throw new Error(
      "[agent-v3] A resposta ficou vazia após os filtros de segurança e formatação",
    );
  }

  // Guard final de autoridade comercial. Uma falha futura no selector não pode
  // voltar a produzir preço Spotify sem spotify_precos.
  const mentionsBrlPrice = /R\$\s*\d/i.test(finalContent);
  if (selectionContext.platform === "spotify" && mentionsBrlPrice && !effectiveSelectedKeys.includes("spotify_precos") && !effectiveSelectedKeys.includes("spotify_playlists")) {
    console.error("[AGENT-V3-AUTHORITY] Bloqueado preço Spotify sem módulo autoritativo", {
      message,
      selected: effectiveSelectedKeys,
      response: finalContent,
    });
    finalContent = "Preciso confirmar o valor correto desse serviço antes de te passar.";
  }

  if (
    selectionContext.platform === "spotify" &&
    selectionContext.product &&
    ["plays", "ouvintes", "saves", "seguidores", "playlist"].includes(selectionContext.product) &&
    effectiveSelectedKeys.includes("spotify_precos") &&
    /R\$\s*\d/i.test(finalContent)
  ) {
    const priceValidation = hasUnsupportedSpotifyPriceClaim({
      response: finalContent,
      moduleContent: mergedModulesMap.spotify_precos?.content || "",
      product: selectionContext.product as ConversationProductForPricing,
      message,
    });
    if (priceValidation.invalid) {
      console.error("[AGENT-V3-AUTHORITY] Preço Spotify divergente do módulo foi substituído", {
        product: selectionContext.product,
        response: finalContent,
      });
      finalContent = priceValidation.fallback;
    }
  }

  // Instagram/Seguidores: em pergunta genérica de preço, nenhuma variante
  // comercial cadastrada pode ser omitida. O fallback é montado diretamente
  // das linhas dos módulos selecionados, sem preço hardcoded.
  if (
    selectionContext.platform === "instagram" &&
    selectionContext.product === "seguidores" &&
    isGenericInstagramFollowerPriceQuestion(message)
  ) {
    const followerOptions = collectInstagramFollowerOptions(
      effectiveSelectedKeys,
      mergedModulesMap,
    );

    if (followerOptions.length > 1) {
      const normalizedResponse = finalContent
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      const missingOption = followerOptions.some((option) => {
        const price = option.match(/R\$\s*([\d.]+(?:,\d+)?)/i)?.[1];
        const variantTokens = option
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .match(/\b(global|brasil|premium|promocional|promo)\b/g) || [];

        const pricePresent = price
          ? normalizedResponse.includes(
              `r$ ${price}`.toLowerCase(),
            ) ||
            normalizedResponse.includes(
              `r$${price}`.toLowerCase(),
            )
          : true;
        const variantPresent =
          variantTokens.length === 0 ||
          variantTokens.every((token) => normalizedResponse.includes(token));

        return !(pricePresent && variantPresent);
      });

      if (missingOption) {
        console.warn("[AGENT-V3-AUTHORITY] Instagram follower variant omitted; using module-derived list", {
          selected: effectiveSelectedKeys,
          options: followerOptions,
          response: finalContent,
        });
        finalContent = `${followerOptions.join("\n")}\nQual você prefere?`;
      }
    }
  }

  // Preço determinístico para plataformas não-Spotify. Quando a mensagem traz
  // quantidade + produto e há uma única regra inequívoca no CMS, o código faz
  // a proporcionalidade. O LLM não decide a matemática.
  if (
    selectionContext.platform &&
    selectionContext.platform !== "spotify"
  ) {
    const deterministicPrice = buildDeterministicMultiProductPriceReply({
      message,
      platform: selectionContext.platform as CommercePlatform,
      moduleKeys: effectiveSelectedKeys,
      modules: mergedModulesMap,
    });
    if (deterministicPrice) {
      const responsePrices = [...finalContent.matchAll(/R\$\s*([\d.]+(?:,\d+)?)/gi)]
        .map((match) => parsePtBrNumber(match[1]))
        .filter((value): value is number => value != null);
      const deterministicPrices = [...deterministicPrice.matchAll(/R\$\s*([\d.]+(?:,\d+)?)/gi)]
        .map((match) => parsePtBrNumber(match[1]))
        .filter((value): value is number => value != null);
      const samePrices =
        responsePrices.length === deterministicPrices.length &&
        deterministicPrices.every((expected) =>
          responsePrices.some((actual) => Math.abs(actual - expected) <= 0.011),
        );

      if (!samePrices) {
        console.error("[AGENT-V3-AUTHORITY] Preço divergente do CMS foi substituído", {
          platform: selectionContext.platform,
          response: finalContent,
          corrected: deterministicPrice,
        });
        finalContent = deterministicPrice;
      }
    }
  }

  // Pagamento só pode avançar depois que plataforma, serviço e uma oferta com
  // preço do catálogo foram validados. O agente não cria cobrança nem promoção.
  if (
    selectionContext.intent === "pagamento" &&
    !selectionContext.hasPaidSignal &&
    !hasValidatedCommercialOfferV3({
      platform: selectionContext.platform,
      product: selectionContext.product,
      moduleKeys: effectiveSelectedKeys,
      modules: mergedModulesMap,
    })
  ) {
    console.error("[AGENT-V3-PAYMENT-GUARD] Pagamento bloqueado sem oferta validada", {
      platform: selectionContext.platform,
      product: selectionContext.product,
      selected: effectiveSelectedKeys,
    });
    finalContent = !selectionContext.platform
      ? "Antes de te orientar no pagamento, me diz qual plataforma você quer."
      : !selectionContext.product
        ? "Antes de te orientar no pagamento, me diz qual serviço você quer nessa plataforma."
        : "Preciso confirmar esse serviço e o valor no catálogo antes de te orientar no pagamento.";
  }

  const responseClaimsPromotion =
    /\b(?:promo[cç][aã]o ativa|oferta especial|desconto de \d|com desconto|valor promocional)\b/i.test(finalContent);
  const hasPromotionAuthority = effectiveSelectedKeys.some((key) =>
    /\b(?:promo[cç][aã]o|promocional|desconto|oferta)\b/i.test(
      mergedModulesMap[key]?.content || "",
    ),
  );
  if (responseClaimsPromotion && !hasPromotionAuthority) {
    console.error("[AGENT-V3-PROMO-GUARD] Promoção sem fonte do catálogo foi bloqueada", {
      selected: effectiveSelectedKeys,
      response: finalContent,
    });
    finalContent = "Não tenho uma promoção confirmada no catálogo para esse serviço agora.";
  }

  // Proteção de disponibilidade: o LLM não pode afirmar que uma plataforma
  // habilitada no CMS não é oferecida pela Mind.
  const normalizedResponseForAvailability = finalContent
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const platform of availableCommercialPlatforms) {
    const falseUnavailablePatterns = [
      new RegExp(`${platform}[^.!?]{0,80}(?:nao (?:oferecemos|oferece|temos|trabalhamos)|infelizmente[^.!?]{0,30}nao)`, "i"),
      new RegExp(`(?:nao (?:oferecemos|oferece|temos|trabalhamos)[^.!?]{0,80}|infelizmente[^.!?]{0,80})${platform}`, "i"),
    ];
    if (falseUnavailablePatterns.some((pattern) => pattern.test(normalizedResponseForAvailability))) {
      console.error("[AGENT-V3-AUTHORITY] Falsa indisponibilidade de plataforma bloqueada", {
        platform,
        response: finalContent,
      });
      const label = platform === "tiktok" ? "TikTok" : platform === "youtube" ? "YouTube" : platform === "spotify" ? "Spotify" : platform === "instagram" ? "Instagram" : platform;
      finalContent = `Também trabalhamos com ${label}. Me diz o que você quer fazer por lá que eu te passo as opções disponíveis.`;
      break;
    }
  }

  const claimsDirectMonetization = /(?:quanto mais|mais)\s+(?:plays|streams|visualizacoes)[^.!?]{0,60}(?:mais|maior)\s+(?:voce )?(?:ganha|fatura|recebe)/i.test(
    finalContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  );
  if (claimsDirectMonetization) {
    console.error("[AGENT-V3-AUTHORITY] Bloqueada promessa de monetização direta", { response: finalContent });
    finalContent = "A Mind ajuda na divulgação, mas não dá para garantir ganho financeiro. A monetização e os pagamentos são definidos pela própria plataforma e pela distribuidora.";
  }

  // Primeiro contato: padroniza a saudação aprovada e elimina variações
  // excessivas do LLM como "Bem-vindo" ou emoji de mão.
  const greetingOnly =
    /^(?:oi|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s*a[ií]|opa)[!.?\s]*$/i.test(
      message.trim(),
    );
  const isFirstTurn = history.length === 0;

  if (greetingOnly && isFirstTurn && !funnelAlreadyCompleted) {
    const normalizedGreeting = message.trim().toLocaleLowerCase("pt-BR");
    const greeting =
      normalizedGreeting.includes("bom dia")
        ? "Bom dia"
        : normalizedGreeting.includes("boa tarde")
          ? "Boa tarde"
          : normalizedGreeting.includes("boa noite")
            ? "Boa noite"
            : "Olá";

    finalContent = `${greeting}! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?`;
  }

  // Nunca se reapresente no meio de uma conversa já existente.
  if ((!isFirstTurn || funnelAlreadyCompleted) && /aqui\s+[ée]\s+a\s+j[uú]lia\s+da\s+mind/i.test(finalContent)) {
    finalContent = finalContent
      .replace(/aqui\s+[ée]\s+a\s+j[uú]lia\s+da\s+mind[.!]?\s*/gi, "")
      .replace(/como\s+posso\s+te\s+ajudar\??/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!finalContent) finalContent = "Tranquilo!";
  }

  // Pós-venda: não crie insegurança nem causas técnicas não cadastradas.
  if (currentIsPostSale || businessDecision?.state === "pedido_realizado" || businessDecision?.state === "pos_venda") {
    finalContent = finalContent
      .replace(/\bse tudo correr bem[,!]?\s*/gi, "")
      .replace(/\bse tudo der certo[,!]?\s*/gi, "")
      .replace(/\btomara que\s*/gi, "")
      .replace(/\bdepende de (?:v[aá]rios )?fatores,?\s*(?:conex[aã]o,?\s*)?(?:sincroniza[çc][aã]o entre sistemas,?\s*)?(?:essas coisas normais)?[.!]?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // TABELA DE PREÇOS DETERMINÍSTICA — TODAS AS PLATAFORMAS
  // Quando o cliente pede tabela/valores gerais, o código monta UMA bolha limpa
  // diretamente dos módulos da plataforma. O LLM não escolhe quais SKUs omitir.
  const asksGeneralPlatformPriceTable =
    Boolean(selectionContext.platform) &&
    /\b(tabela|valores|precos|preco dos servicos|quanto custa os servicos|todos os precos|todos os valores)\b/.test(normalizedTurnText);

  if (asksGeneralPlatformPriceTable && selectionContext.platform) {
    const platform = selectionContext.platform as CommercePlatform;

    // Spotify mantém a ordem comercial aprovada e inclui Playlist.
    if (platform === "spotify" && mergedModulesMap.spotify_precos?.content) {
      const spotifyPriceModule = mergedModulesMap.spotify_precos.content;
      const followerRule = parseSpotifyPriceRule(spotifyPriceModule, "seguidores");
      const playsRule = parseSpotifyPriceRule(spotifyPriceModule, "plays");
      const savesRule = parseSpotifyPriceRule(spotifyPriceModule, "saves");
      const playlistRule = parseSpotifyPriceRule(spotifyPriceModule, "playlist");
      if (followerRule && playsRule && savesRule && playlistRule) {
        finalContent = [
          "Spotify",
          "",
          `${followerRule.baseQuantity} Seguidores - R$ ${followerRule.basePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${playsRule.baseQuantity} Plays + Ouvintes - R$ ${playsRule.basePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `${savesRule.baseQuantity} Saves - R$ ${savesRule.basePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `1 Música em 10 Playlists - R$ ${playlistRule.basePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ].join("\n");
      }
    } else {
      const table = buildGeneralPlatformPriceTable({ platform, modules: mergedModulesMap });
      if (table) finalContent = table;
    }
  }

  // URLs fornecidas pelos módulos chegam isoladas no WhatsApp. O runtime não
  // conhece nem inventa domínio comercial; apenas formata o valor autorizado.
  const responseUrls = Array.from(
    new Set(finalContent.match(/https?:\/\/[^\s<>()]+/gi) || []),
  );
  for (const rawUrl of responseUrls) {
    const url = rawUrl.replace(/[.,;:!?]+$/, "");
    finalContent = finalContent.replace(
      rawUrl,
      `===SPLIT===${url}===SPLIT===`,
    );
  }
  finalContent = finalContent
    .replace(/(?:===SPLIT===\s*){2,}/g, "===SPLIT===")
    .replace(/^===SPLIT===|===SPLIT===$/g, "")
    .trim();
  // Correção determinística de saudação por horário
  const hourBr = (new Date().getUTCHours() - 3 + 24) % 24;
  const greetingStartRx = /^(?:Bom dia|Boa tarde|Boa noite|Olá|Opa|E aí)[,!\s]*/i;
  if (greetingStartRx.test(finalContent)) {
    let newGreeting = "Olá";
    if (hourBr >= 5 && hourBr < 12) newGreeting = "Bom dia";
    else if (hourBr >= 12 && hourBr < 18) newGreeting = "Boa tarde";
    else if (hourBr >= 18 || hourBr < 5) newGreeting = "Boa noite";
    
    finalContent = finalContent.replace(greetingStartRx, `${newGreeting}, `);
  }

  // ISOLAMENTO DO LINK DO PAINEL: garante que "mindsmmpanel.com" sempre
  // fica numa bolha própria, nunca colado com o texto ao redor. Regex
  // tolerante a espaço/quebra entre "mindsmmpanel" e "com" (o modelo às
  // vezes escreve "mindsmmpanel. com" com espaço, o que quebrava a versão
  // anterior do isolamento e causava o link sendo cortado ao meio).
  if (/mindsmmpanel\s*\.?\s*com/i.test(finalContent)) {
    const panelUrl = "https://mindsmmpanel.com";
    finalContent = finalContent
      .replace(
        /(?:https?:\/\/)?(?:www\.)?mindsmmpanel\s*\.?\s*com\/?/gi,
        `===SPLIT===${panelUrl}===SPLIT===`,
      )
      .replace(/(?:===SPLIT===\s*){2,}/g, "===SPLIT===")
      .replace(/^===SPLIT===|===SPLIT===$/g, "")
      .trim();
  }

  // COMMERCIAL GUARD (fase 1 — detecção, sem correção automática ainda):
  // Extrai todo valor "R$ X" mencionado na resposta e confere se existe
  // literalmente no texto dos módulos carregados. Isso não pega proporções
  // calculadas corretamente (ex: "500 = R$7,50" a partir de "1000 = R$15"),
  // só serve pra sinalizar quando a IA citou um valor que não vem de
  // nenhuma fonte carregada — provável alucinação.
  {
    const priceRegex = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
    const pricesInResponse = [...finalContent.matchAll(priceRegex)].map((m) => m[0]);
    if (pricesInResponse.length > 0) {
      const normalizeSpacing = (s: string) => s.replace(/\s+/g, "");
      const moduleTextNormalized = normalizeSpacing(String(modulePrompt || ""));
      const suspiciousPrices = pricesInResponse.filter(
        (p) => !moduleTextNormalized.includes(normalizeSpacing(p)),
      );
      if (suspiciousPrices.length > 0) {
        console.warn("[COMMERCIAL-GUARD] Preço(s) mencionado(s) na resposta NÃO encontrado(s) literalmente nos módulos carregados — possível alucinação (pode ser proporção calculada corretamente, revisar manualmente):", {
          suspiciousPrices,
          allPricesInResponse: pricesInResponse,
          responsePreview: finalContent.slice(0, 200),
        });
      }
    }
  }

  // Auto-split logic
  const replies = autoSplitLongPartsV3(finalContent);

  const result = {
    response: finalContent,
    replies,
    intelligence: {
      temperature,
      confidence,
      intent,
      stage,
      purchase_probability,
      sentiment,
      urgency,
      recommended_action,
      reasoning,
    },
    score: {
      total: conversation_score,
      // humanity, clarity etc are derived from feedback or expanded in extractor later
    },
    usage: {
      model,
      request_id: llmResult.request_id || "unknown", // Adjust if llmResult has it differently
      input_tokens,
      output_tokens,
      cache_creation_input_tokens,
      cache_read_input_tokens,
      latency_ms,
    },
    cost: {
      input_usd,
      output_usd,
      cache_usd,
      total_usd,
    },
    modules: {
      selected_keys: effectiveSelectedKeys,
      versions: Object.fromEntries(
        effectiveSelectedKeys.map((key) => [key, numericModuleVersion(key)]),
      ),
      estimated_tokens_by_module: Object.fromEntries(
        modulesTelemetry.map((m) => [m.key, m.tokens]),
      ),
      estimated_chars_by_module: Object.fromEntries(
        modulesTelemetry.map((m) => [m.key, m.chars]),
      ),
      prompt_tokens_without_commercial: promptComparison.withoutCommercial,
      prompt_tokens_with_commercial: promptComparison.withCommercial,
      commercial_tokens_added: promptComparison.diff,
      selection_context: selectionContext,
      selection_reasons: selectionReasons,
    },
    rawResponse: rawText,
    rawPrompt: systemPrompt,
  };

  try {
    const { logEvent } = await import("@/lib/agent-logger.server");
    await logEvent({
      userId,
      workspaceId,
      phone: phone ?? null,
      conversationId: conversationId ?? null,
      type: "agent_v3_turn",
      level: "info",
      summary: `V3 respondeu com ${effectiveSelectedKeys.length} módulos`,
      prompt: JSON.stringify(result.rawPrompt),
      response: result.rawResponse || result.response,
      durationMs: result.usage.latency_ms,
      metadata: {
        message_id: messageId ?? null,
        selected_modules: effectiveSelectedKeys,
        selection_context: selectionContext,
        selection_reasons: selectionReasons,
        usage: result.usage,
        cost: result.cost,
        intelligence: result.intelligence,
        history_telemetry: historyTelemetry ?? null,
      },
    });
  } catch (err) {
    console.error("[agent-v3] Failed to log production telemetry:", err);
  }

  return result;
}
