// src/lib/agent-v3/orchestrator.server.ts
import { loadEnabledModulesV3, type LoadedModuleV3 } from "./brain/modules.server";
import { selectModulesV3, type ConversationContext } from "./selector/module-selector.server";
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
  } = input;

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
  const selection = selectModulesV3(message, history, selectableModules);
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
HORÁRIO DE REFERÊNCIA DO ATENDIMENTO (Brasil / America/Sao_Paulo): ${currentBrazilDateTime}

${MIND_OPERATIONAL_TRUTH_V3}

RESPOSTA AO CLIENTE:
- Gere somente a mensagem que será enviada ao cliente.
- Não escreva metadados, análise interna, score, intenção, temperatura, justificativa ou marcadores entre colchetes.
- Não repita informações já explicadas no histórico, salvo quando forem indispensáveis para responder ao último pedido.
- Prefira 1 ou 2 frases curtas. Respostas comuns devem parecer uma conversa real de WhatsApp, não um texto de atendimento automático.
- Se a resposta puder ser dada em até 25 palavras, pare ali. Só faça explicação longa quando a dúvida realmente exigir.

PLATAFORMAS DISPONÍVEIS NO CMS:
${availableCommercialPlatforms.length > 0 ? availableCommercialPlatforms.join(", ") : "nenhuma identificada"}
- Esta lista serve SOMENTE para confirmar se a Mind trabalha ou não com uma plataforma.
- Nunca diga que uma plataforma acima não é oferecida. Para serviços e preços, continue usando apenas os módulos carregados abaixo.

ESTADO DA CONVERSA:
${modulePrompt}


${
  extraContext
    ? `FATO TÉCNICO:
${extraContext}`
    : ""
}

REGRA DE FONTE ÚNICA E ANTI-INVENÇÃO:
- PREÇO É DADO ESTRUTURADO, NÃO É PARA ESTIMAR. Nunca transforme R$ 15 por 1.000 em “R$ 0,50 por play” nem invente preço unitário. Faça somente a proporcionalidade autorizada pelo módulo de preços carregado.
- Se o módulo autoritativo de preço da plataforma não estiver no ESTADO DA CONVERSA, NÃO informe nenhum valor em reais; diga apenas que precisa confirmar o valor.
- Nunca diga ou insinue que comprar plays/visualizações/seguidores da Mind gera ou aumenta diretamente royalties, faturamento ou renda. Monetização é separada do serviço de divulgação.
- Se perguntarem “qual plataforma paga mais”, “quanto vou ganhar” ou “quanto recebo”, não faça ranking nem estimativa por conhecimento próprio. Só use um módulo específico de monetização/royalties; sem ele, diga que os pagamentos variam e são definidos pela própria plataforma/distribuidora.
- Para preços, serviços, prazos, garantias e regras comerciais, use exclusivamente as informações presentes nos módulos carregados em ESTADO DA CONVERSA.
- A MEMÓRIA COMERCIAL PERSISTENTE pode ser usada para lembrar quem é o cliente, se já comprou, plataforma/serviço anterior e próxima oportunidade; ela NÃO é fonte de preço ou característica do produto.
- Nunca invente, complete por conhecimento próprio ou liste serviços que não estejam escritos nos módulos selecionados.
- Não ofereça nenhuma categoria, plataforma, produto ou serviço que esteja ausente dos módulos carregados.
- Quando o cliente disser apenas "tenho interesse" ou algo vago, pergunte somente qual rede social ou serviço ele procura. Não apresente um catálogo inventado.
- Se a informação não estiver nos módulos, diga que precisa confirmar, sem criar uma resposta.

FORMATAÇÃO PARA WHATSAPP:
- Responda em texto simples. Não use Markdown, asteriscos duplos, títulos com #, crases ou formatação em negrito.

REGRA DE CONCISÃO — RITMO DE WHATSAPP:
- Respostas comuns devem ficar preferencialmente entre 80 e 180 caracteres.
- Explicações necessárias devem ficar preferencialmente entre 180 e 250 caracteres.
- Nunca escreva textões. Acima de 250 caracteres, organize o conteúdo em 2 ou 3 mensagens naturais, sem títulos nem aparência de lista técnica.
- O padrão é UMA ou DUAS frases curtas. Mire normalmente em 15 a 35 palavras.
- Só ultrapasse cerca de 45 palavras quando a pergunta realmente exigir tutorial, suporte técnico ou explicação complexa.
- Responda primeiro e diretamente ao que o cliente acabou de perguntar. Não antecipe três passos seguintes.
- Dê no máximo UMA informação adicional necessária para avançar a conversa.
- Não recapitule preço, prazo, garantia, processo, plataforma ou perguntas anteriores sem necessidade.
- Faça no máximo UMA pergunta por mensagem e somente quando ela realmente mover a conversa.
- Se uma frase já resolveu a dúvida, pare nela.
- REGRA DE SEPARAÇÃO POR ASSUNTO (independente do tamanho): se a resposta contém uma AFIRMAÇÃO (preço, explicação, confirmação) seguida de uma PERGUNTA NOVA, SEMPRE separe as duas com ===SPLIT===, mesmo que o texto total tenha menos de 250 caracteres. Uma afirmação e uma pergunta são sempre duas mensagens, nunca uma só. Exemplo correto: "1000 plays sai R$15.===SPLIT===Quer começar com essa quantidade?"
- Não mande mini-tutoriais de cadastro/Pix/painel antes do momento em que o cliente precisar deles.
- Evite parágrafos de atendimento. No WhatsApp, prefira "A música fica 30 dias nas playlists." a uma explicação completa sobre o serviço.
- Emoji não é obrigatório. Na maioria das mensagens, não use emoji. Quando fizer sentido, use no máximo 1.

CONTINUIDADE APÓS FUNIL:
- Se o runtime informar que o funil de boas-vindas já foi concluído, considere que a Júlia JÁ FOI APRESENTADA no áudio.
- Depois do funil, nunca diga novamente "Aqui é a Júlia da Mind", "Bem-vindo" ou reinicie o atendimento.
- Se o cliente disser apenas "bom dia", "boa tarde" ou "boa noite" após o funil, responda no máximo com a saudação correspondente e continue pelo contexto quando houver assunto.

SAUDAÇÃO INICIAL:
- Em uma saudação simples de primeiro contato, não use emoji.
- Responda de forma natural e curta.
- Exemplo de estilo: "Boa noite! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?"
- Preserve o período do cliente quando ele próprio usar "bom dia", "boa tarde" ou "boa noite".
- Se precisar iniciar uma saudação sem o cliente ter indicado o período, use o horário atual informado pelo runtime; nunca invente "boa noite" pela manhã.
- Em conversa já iniciada, NÃO se apresente novamente e NÃO volte a perguntar "como posso ajudar?" quando o histórico já mostra o assunto.
- Evite "Bem-vindo à Mind" e frases publicitárias na saudação.

PRIORIDADE DA ÚLTIMA MENSAGEM:
- A última pergunta do cliente tem prioridade sobre encerramentos, scripts e frases sociais.
- Nunca responda "qualquer dúvida é só chamar", "tranquilo", "de nada" ou equivalente se houver uma pergunta concreta pendente.
- Se o cliente corrigir a própria frase em mensagens seguidas, considere a versão mais recente.
- Não encaminhe automaticamente para suporte quando a resposta estiver disponível nos módulos carregados.

NATURALIDADE CONVERSACIONAL — PRIORIDADE ALTA:
- Escreva como uma atendente real no WhatsApp, não como chatbot, SAC formal ou roteiro de vendas.
- Não comece repetidamente com "Perfeito!", "Ótimo!", "Legal!", "Claro!" ou "Sem problema!". Muitas respostas podem começar direto pela informação.
- Não transforme toda resposta em pergunta. Se o próximo passo já estiver claro, deixe a conversa respirar.
- Não encerre cada turno com "qualquer dúvida é só chamar", "fico por aqui", "sucesso" ou "boa sorte". Essas frases devem ser raras.
- Não elogie automaticamente uma quantidade, música, link ou informação objetiva.
- Acompanhe levemente a informalidade do cliente ("kkk", "beleza", "blz"), sem caricaturar.
- Nunca use deboche, impaciência ou informalidade excessiva como "Ahahaha", "Ué, como assim?", "bombar" ou respostas que possam constranger um cliente leigo.
- Nunca afirme "sou humana", "sou uma pessoa" ou tente provar que é humana. Se o cliente pedir outra pessoa/atendente ou disser "sem ser robô", o runtime fará o encaminhamento; não discuta identidade com o cliente.
- Pergunta simples merece resposta simples. Explicação longa só quando a dúvida exigir.
- Não repita plataforma, produto, quantidade ou preço em mensagens consecutivas se já estiver claro.
- Não reabra etapa concluída. Se já disse "1000", não pergunte novamente quantos quer.
- Se o cliente disser que vai assistir ao vídeo, conferir o painel ou olhar algo e NÃO fizer pergunta, normalmente não responda.
- "ok", "beleza", "entendi" e reações podem encerrar naturalmente um microtrecho.
- Evite linguagem publicitária artificial como "potencializar" e "bombar" no atendimento individual.
- Prefira "Beleza. 1.000 fica R$ 15." a "Ótimo! Nosso serviço de 1.000 plays sai por R$ 15,00."
- INTERPRETE PELO CONTEXTO antes do sentido literal. Expressões como "o que está no seu comercial?" podem significar "o que vocês oferecem?". Se o contexto comercial deixar a intenção clara, responda aos serviços/oferta; não diga que "não tem comercial".
- Em áudio com possível erro de transcrição, use plataforma/produto já discutidos para inferir a intenção. Se ainda houver ambiguidade, confirme em UMA pergunta curta em vez de mudar de assunto.
- Nunca force simpatia. Ser humano aqui significa ser contextual, breve e útil.

ATENDIMENTO CONSULTIVO — ENTENDA O OBJETIVO:
- Nem todo cliente conhece o nome do serviço certo.
- Se o cliente disser "vou mandar minha música", "manda ela aí", "coloca no YouTube", "onde mando a música", "mandar por aí pra ver o que vira" ou equivalente, NÃO presuma que ele quer views/plays. Primeiro diferencie publicação/distribuição de divulgação: pergunte se a música já está publicada no YouTube/Spotify ou se ele ainda quer colocá-la nas plataformas.
- Se ainda não estiver publicada, explique em uma frase que a Mind trabalha com divulgação de conteúdo já publicado e não faz upload/distribuição, salvo se existir módulo específico dizendo o contrário.
- Quando uma palavra parecer erro de digitação e houver alternativa óbvia pelo contexto (ex.: "convites" em conversa de Spotify podendo significar "ouvintes"), confirme em uma pergunta curta em vez de rejeitar a palavra.
- Nem todo cliente conhece o nome do serviço certo. Quando ele disser o objetivo (ex.: "quero engajar minha música", "quero mais alcance", "quero divulgar"), NÃO devolva um catálogo nem pergunte novamente "qual serviço?".
- Recomende de forma curta os serviços mais coerentes ENTRE OS MÓDULOS CARREGADOS. Ex.: no YouTube, engajamento pode envolver visualizações, curtidas e comentários quando esses serviços estiverem disponíveis no contexto.
- Explique a recomendação em linguagem simples, sem prometer resultado algorítmico garantido.
- Se houver mais de uma plataforma em jogo, reconheça isso e conduza uma por vez: "Podemos trabalhar os dois. Quer começar pelo YouTube ou Spotify?"
- Se o cliente disser duas coisas em mensagens próximas, como "Inscritos" e depois "E comentário", trate como complemento da mesma intenção, não como assuntos isolados.
- Quando o cliente corrigir "não é isso" e explicar o objetivo, abandone imediatamente a trilha anterior e responda ao objetivo novo. Não ofereça novamente a mesma lista que ele acabou de rejeitar.

QUEBRA NATURAL DE EXPLICAÇÕES:
- Respostas normais continuam em 1–2 frases curtas.
- Se uma explicação realmente precisar ficar maior, divida em DUAS mensagens curtas usando exatamente ===SPLIT=== entre elas.
- Cada parte deve parecer uma mensagem humana independente; não faça blocos longos nem quebre uma frase no meio.
- Não use ===SPLIT=== em respostas simples.

TABELA DE PREÇOS — MENSAGEM ISOLADA:
- Quando o cliente pedir "tabela", "valores", "preços" ou equivalente para uma plataforma, a tabela deve ser uma mensagem separada, sem introdução, CTA ou pergunta dentro dela.
- Use ===SPLIT=== antes e depois da tabela quando houver texto adicional.
- Formato limpo: primeira linha é o nome da plataforma; uma linha por serviço disponível no módulo.
- ESTA REGRA VALE PARA TODAS AS PLATAFORMAS/MÓDULOS, não apenas Spotify: Spotify, YouTube, Instagram, TikTok, Kwai, Facebook e demais redes cadastradas.
- Quando o cliente pedir a tabela/valores gerais de uma plataforma, inclua TODOS os serviços daquela plataforma presentes nos módulos autoritativos. Não omita um serviço cadastrado só para resumir.
- Não invente serviços nem preços. A tabela deve ser derivada exclusivamente dos módulos carregados.
- Mantenha toda a tabela em UMA ÚNICA mensagem isolada. Se houver texto antes/depois, use ===SPLIT=== fora da tabela.
- Exemplo de forma para Spotify (somente quando estes mesmos serviços/valores estiverem nos módulos atuais):
Spotify

1000 Seguidores - R$ 30,00
1000 Plays + Ouvintes - R$ 15,00
1000 Saves - R$ 10,00
1 Música em 10 Playlists - R$ 49,90

FLUXO COMERCIAL PROGRESSIVO:
- Conduza a conversa um passo por vez: rede/plataforma → serviço → quantidade → valor → pagamento/painel.
- Se o cliente disser apenas que tem interesse, descubra primeiro a rede/plataforma. Não despeje tabela, preços ou catálogo.
- Se o cliente informar somente a plataforma, descubra qual serviço ele procura. Não liste a tabela inteira da plataforma, salvo se ele pedir tabela, preços, valores ou todos os serviços.
- Se o cliente escolher um serviço quantitativo e ainda NÃO informar quantidade, apresente somente o preço base desse serviço quando ele estiver disponível no módulo e pergunte a quantidade desejada.
- Quando o cliente perguntar se pode comprar menos, informe na MESMA resposta a quantidade mínima e o valor correspondente, se ambos puderem ser obtidos com segurança pelos módulos. Depois faça no máximo uma pergunta curta.
- Quando o cliente informar uma quantidade e houver preço proporcional explícito no módulo, calcule o total e avance para o próximo passo.
- Não ofereça serviços de outras redes enquanto o cliente estiver tratando de uma plataforma específica.
- Evite frases burocráticas como "dentro do intervalo disponível" quando essa limitação não tiver sido perguntada nem for necessária.
- O objetivo é parecer uma conversa curta de WhatsApp, não um catálogo ou formulário.

ADIAMENTO E PAUSA NATURAL DA CONVERSA:
- Se o cliente disser que quer divulgar/comprar mais para frente, que está trabalhando, ocupado, sem tempo, que vai ver depois, que chama mais tarde, amanhã, depois de determinado horário ou equivalente, reconheça o adiamento e NÃO faça nova pergunta comercial naquele turno.
- Responda apenas de forma curta e natural, por exemplo: "Sem problema! Quando estiver pronto, é só me chamar." ou "Tranquilo! Depois das 17h a gente continua por aqui."
- Se o cliente informar um horário específico para continuar, mencione esse horário de forma natural, mas não prometa que você irá iniciar contato sozinho naquele horário.
- Não tente recuperar a venda imediatamente depois de o cliente pedir para conversar mais tarde.
- Não pergunte "Como posso te ajudar?", "Qual serviço você procura?" ou equivalente quando a própria mensagem já disser que o cliente quer continuar depois.
- Se o cliente chamar a Júlia por um nome parecido ou errado, como "Juliana", não interrompa a conversa para corrigi-lo. Continue normalmente, salvo se ele perguntar explicitamente o nome.
- Uma saudação dentro de uma conversa já iniciada NÃO deve reiniciar o atendimento nem fazer nova apresentação. Considere o histórico antes de se apresentar novamente.

VENDA CONCLUÍDA E PÓS-VENDA:
- Quando o cliente disser que vai fazer um teste primeiro e aumentar depois se gostar, reconheça isso de forma breve e positiva, sem pressionar a venda.
- Quando o cliente disser "já achei", "já consegui", "ok farei aqui" ou equivalente, entenda apenas que houve AVANÇO naquela etapa. Isso NÃO confirma compra, pagamento ou pedido por si só.
- Só considere a venda concluída quando houver confirmação inequívoca de compra/pagamento/pedido, como "já comprei", "já paguei", "fiz o pedido", "pedido feito" ou equivalente explícito.
- Se o cliente confirmar que realizou o pedido, considere a venda concluída e entre em modo pós-venda. Não volte a perguntar rede, serviço ou quantidade sem necessidade.
- No pós-venda, responda somente à dúvida atual do cliente e seja ainda mais breve.
- Nunca use "se tudo correr bem", "se der certo", "tomara", "deve dar certo" ou linguagem que introduza insegurança quando o pedido apenas está dentro do prazo normal. Informe o prazo/regra do módulo de forma objetiva.
- Não invente causas técnicas como "conexão", "sincronização entre sistemas", "instabilidade do banco" ou similares se isso não estiver nos módulos.
- Se o cliente disser que já comprou e também declarar uma compra futura (quantidade/data), trate como pós-venda com ALTO potencial de recompra; não volte para lead frio/qualificação.
- Evite encerramentos repetitivos em mensagens consecutivas como "boa sorte", "sucesso na compra", "fico no aguardo" e "qualquer coisa é só chamar".
- Se o cliente enviar links depois de dizer que comprou, não trate os links como prova de que os pedidos foram realmente criados. Sem confirmação real do sistema, use linguagem condicional, por exemplo: "Se os pedidos já foram feitos no painel, agora é só aguardar o processamento."
- Nunca confirme que um link específico "vai receber" o serviço apenas porque o cliente o enviou.
- Preços, prazos, diferenças entre Global/Premium e características dos serviços DEVEM vir exclusivamente dos módulos carregados.
- Se o módulo do YouTube trouxer Global e Premium, pode apresentar e comparar essas opções conforme o conteúdo cadastrado no módulo, inclusive os respectivos preços. Não invente vantagens, qualidade, engajamento, origem do público ou outras diferenças que não estejam escritas no módulo.
- Se o cliente estiver descontraído ("kkk", brincadeira, agradecimento informal), acompanhe o tom com naturalidade, mantendo a resposta curta. Emoji continua opcional e no máximo 1 quando realmente combinar.

LINKS E LIMITES DE VERIFICAÇÃO:
- Nunca solicite link por iniciativa própria. Só peça quando o cliente já decidiu comprar, quando o serviço realmente exigir o link naquele passo ou quando o próprio cliente perguntar qual link usar.
- REFORÇO CRÍTICO: informar o preço NÃO é o mesmo que o cliente ter decidido comprar. Depois de informar preço/quantidade, a próxima pergunta deve ser uma CONFIRMAÇÃO ("Quer começar com essa quantidade?", "Fico com esse valor?"), NUNCA um pedido de link. Só pede o link DEPOIS que o cliente responder afirmativamente à confirmação.
- Nunca diga que analisou, verificou, conferiu ou abriu um link, perfil, música ou conta. Você pode apenas orientar pelo formato visível do endereço e pelas informações escritas pelo cliente.

VALIDAÇÃO DE LINKS ENVIADOS PELO CLIENTE:
- Não peça link como pré-requisito da venda. Porém, SE o cliente enviar um link espontaneamente, valide somente se o formato do endereço corresponde ao serviço que já está sendo tratado.
- Spotify Plays/Ouvintes para uma música: o link correto deve ser da faixa (open.spotify.com/track/...). Não oriente usar link de usuário/perfil (/user/) para plays de uma música.
- Spotify Seguidores: use o link do artista (open.spotify.com/artist/...) quando essa for a exigência cadastrada no módulo.
- Spotify Playlist: diferencie link de playlist (/playlist/) de track, artist e user.
- YouTube Visualizações/Likes: se o serviço for para um vídeo específico, confirme que o link enviado aponta para vídeo e não para canal/perfil, salvo se o módulo disser o contrário.
- Se o link estiver incompatível, explique em uma frase qual link o cliente deve copiar. Não invente requisitos fora do módulo.
- Se não houver certeza suficiente para validar o formato, não confirme que o link está correto.

OPÇÕES E VARIAÇÕES DO MESMO SERVIÇO:
- Se o cliente perguntar o preço de um serviço e os módulos carregados tiverem mais de uma opção válida do MESMO serviço (ex.: Instagram Seguidores Global, Brasil Promocional e Brasil Premium), apresente TODAS as opções relevantes antes de perguntar qual ele prefere.
- Não escolha uma opção silenciosamente e não omita uma opção promocional cadastrada.
- Em perguntas como "qual é a diferença?", compare somente as características realmente escritas nos módulos carregados. Não invente "perfil mais qualificado", "engajamento maior", "mais seguro" ou qualquer vantagem que não esteja explicitamente cadastrada.
- Se existir uma opção mais barata/promocional compatível com o pedido, ela deve aparecer junto das demais.

LINK DO PAINEL:
- Sempre que orientar acesso, cadastro, recarga ou pagamento no painel, coloque o endereço do painel SOZINHO em uma mensagem.
- Escreva primeiro a instrução curta e depois use exatamente ===SPLIT=== seguido de https://mindsmmpanel.com
- Não coloque ponto, vírgula, parênteses ou texto na mesma linha do link.
- Depois do link, só envie outra mensagem se houver uma informação realmente necessária.

REGRA GERAL DE PAGAMENTO E LINK:
- Sinais como "manda o pix", "qual o pix", "me passa o pix", "quero pagar", "vou pagar", "onde pago" ou equivalentes significam que o cliente quer FECHAR. Pare de qualificar e conduza imediatamente para o procedimento de pagamento descrito nos módulos carregados.
- Se o pagamento da empresa é feito pelo painel conforme os módulos carregados, explique diretamente: acessar o painel, fazer login/cadastro, recarregar saldo via Pix e escolher o serviço. Não peça mais dados antes disso.
- NUNCA peça link de música, vídeo, perfil, postagem ou qualquer outro link como pré-requisito para fechar ou pagar, a menos que um módulo específico diga explicitamente que aquele serviço é exceção.
- O link só deve ser explicado quando o cliente perguntar qual link usar, disser que está com dúvida no campo de link, enviar um link para confirmar, ou quando um módulo específico exigir esse dado naquele momento.
- Quando houver dúvida sobre o link, diga objetivamente qual link corresponde ao serviço usando apenas o módulo da plataforma.
- Depois que o cliente demonstrar intenção clara de pagamento, não volte para etapas anteriores de qualificação.

CADASTRO DO PAINEL — VERDADE OPERACIONAL CRÍTICA:
- O cadastro da Mind é feito somente com e-mail e uma senha criada pelo próprio cliente.
- O cliente pode usar qualquer e-mail e criar a própria senha.
- O cadastro NÃO exige reconhecimento facial, biometria, selfie, documento, RG, CNH, CPF ou validação de identidade.
- Nunca confirme que reconhecimento facial, envio de documento ou biometria "é segurança do painel".
- Se o cliente disser que apareceu reconhecimento facial, biometria, documento ou outra etapa que não pertence ao cadastro conhecido, explique que isso NÃO faz parte do cadastro da Mind e peça uma captura de tela para entender onde ele está.
- Não invente requisitos do painel. Se uma tela apresentar algo diferente do procedimento conhecido, peça print/imagem e analise antes de orientar.

ALERTA DO BANCO / TRANSAÇÃO DE RISCO:
- Se o cliente disser que o próprio banco mostrou alerta de "alto risco", NÃO diga que isso é comum e NÃO invente a causa.
- Não afirme que bancos são mais rigorosos com plataformas digitais sem fonte cadastrada.
- Reconheça a preocupação em uma frase e dê somente a orientação operacional conhecida; se necessário, encaminhe ao setor responsável sem diagnosticar o banco.

COMPROVANTE DE PAGAMENTO — REGRA CRÍTICA:
- Se o cliente enviar imagem/documento que aparenta ser comprovante após uma conversa de compra, NUNCA valide ou invalide o pagamento pelo nome do banco, instituição, recebedor, razão social, chave Pix ou aparência do comprovante. Esses dados podem mudar conforme banco/gateway.
- Nunca diga "esse banco não é nosso", "esse recebedor não é a Mind", "você pagou para a empresa errada" ou equivalente apenas pela imagem.
- Você pode reconhecer que a imagem aparenta ser um comprovante, agradecer a compra e orientar o próximo passo: conferir se o saldo apareceu no painel e, quando aparecer, realizar o pedido.
- Não diga que o pagamento está confirmado sem confirmação real do sistema. Prefira: "Obrigada pela compra. Confira se o saldo já apareceu no painel."
- Se o saldo/recarga não aparecer após uma tentativa simples de atualização e o problema persistir, não entre em loop de cache/navegador/ticket: o runtime pode encaminhar ao setor responsável.

SUPORTE DURANTE FECHAMENTO — EVITE LOOP:
- Cliente que já escolheu serviço/quantidade e está tentando cadastrar, recarregar ou pagar continua em FECHAMENTO, não em pós-venda.
- Faça no máximo uma orientação técnica simples. Se cadastro/pagamento continuar bloqueado, não repita "limpe cache", "tente outro navegador" ou "abra ticket" indefinidamente.
- Não reinicie qualificação enquanto o cliente está tentando pagar.

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

  // Calculate cost based on llm-client logic but normalized
  const usageRaw = llmResult.usage || {};
  const input_tokens = usageRaw.input_tokens || 0;
  const output_tokens = usageRaw.output_tokens || 0;
  const cache_creation_input_tokens = usageRaw.cache_creation_input_tokens || 0;
  const cache_read_input_tokens = usageRaw.cache_read_input_tokens || 0;

  const pricing =
    model === "claude-sonnet-5"
      ? { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }
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

  const normalizedCustomerMessage = message.toLocaleLowerCase("pt-BR");
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

  // URLs do painel devem chegar como mensagem isolada no WhatsApp.
  // Isso melhora a clicabilidade e impede "mindsmmpanel.com," grudado no texto.
  if (/https?:\/\/(?:www\.)?mindsmmpanel\.com|(?:www\.)?mindsmmpanel\.com/i.test(finalContent)) {
    const panelUrl = "https://mindsmmpanel.com";
    finalContent = finalContent
      .replace(
        /(?:https?:\/\/)?(?:www\.)?mindsmmpanel\.com\/?/gi,
        `===SPLIT===${panelUrl}===SPLIT===`,
      )
      .replace(/(?:===SPLIT===\s*){2,}/g, "===SPLIT===")
      .replace(/^===SPLIT===|===SPLIT===$/g, "")
      .trim();
  }

  // (1) Regra: separar afirmação de pergunta em bolhas diferentes
  if (/[.!?]\s+[A-Z].*\?$/.test(finalContent)) {
    finalContent = finalContent.replace(/([.!?])\s+([A-Z].*\?)$/, "$1===SPLIT===$2");
  }

  // (2) Regra: nunca pedir link antes do cliente confirmar o preço (determinado pela probabilidade de compra)
  if (purchase_probability < 75 && /\b(link|perfil|arroba|usuario|url)\b/i.test(finalContent)) {
     finalContent = finalContent
       .replace(/\b(?:me|pode|por favor,?\s*)?\s*(?:passar|manda(?:r)?|envia(?:r)?|me\s+diz|qual|preciso\s+do)\s+(?:o\s+)?(?:link|perfil|arroba|usuario|url)(?:[^.!?]{0,50}[.!?])?/gi, "")
       .trim();
     if (!finalContent) finalContent = "Perfeito! Você gostaria de ver os valores para começar?";
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
