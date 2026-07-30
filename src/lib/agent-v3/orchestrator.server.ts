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

type CommercePlatform = "instagram" | "youtube" | "spotify" | "tiktok" | "kwai" | "facebook";
type CommerceProduct = "seguidores" | "curtidas" | "visualizacoes" | "inscritos" | "plays" | "ouvintes" | "saves" | "playlist" | "live" | "horas" | "comentarios";

const PRODUCT_PRICE_TERMS: Record<CommerceProduct, RegExp> = {
  seguidores: /Seguidores/i,
  curtidas: /Curtidas|Likes/i,
  visualizacoes: /Visualizações|Views/i,
  inscritos: /Inscritos/i,
  plays: /Plays/i,
  ouvintes: /Ouvintes/i,
  saves: /Saves|Salvar/i,
  playlist: /Playlists/i,
  live: /Live/i,
  horas: /Horas/i,
  comentarios: /Comentarios/i,
};

function moduleBelongsToPlatform(key: string, module: LoadedModuleV3, platform: CommercePlatform): boolean {
  if (key === platform || key.startsWith(`${platform}_`)) return true;
  return module.routing.platforms.includes(platform);
}

function enabledCommercialPlatforms(modules: Record<string, LoadedModuleV3>): string[] {
  const platforms = new Set<string>();
  for (const [key, module] of Object.entries(modules)) {
    for (const p of module.routing.platforms) platforms.add(p);
    if (key === "instagram" || key.startsWith("instagram_")) platforms.add("instagram");
    if (key === "youtube" || key.startsWith("youtube_")) platforms.add("youtube");
    if (key === "spotify" || key.startsWith("spotify_")) platforms.add("spotify");
    if (key === "tiktok" || key.startsWith("tiktok_")) platforms.add("tiktok");
    if (key === "kwai" || key.startsWith("kwai_")) platforms.add("kwai");
    if (key === "facebook" || key.startsWith("facebook_")) platforms.add("facebook");
  }
  return Array.from(platforms);
}

type ModuleTelemetry = {
  key: string;
  name: string;
  chars: number;
  tokens: number;
};

export type OrchestratorInputV3 = {
  userId: string;
  workspaceId: string;
  conversationId?: string;
  phone?: string;
  message: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
  historyTelemetry?: any;
  anthropicApiKey?: string;
  extraContext?: string;
  customModules?: Record<string, string | LoadedModuleV3>;
  enabledModules?: string[];
  businessDecision: BusinessDecisionV3;
  funnelAlreadyCompleted?: boolean;
  customerLifecycle?: string | null;
  repurchasePotential?: string | null;
  inputKind: "texto" | "audio" | "image" | "sticker";
  imageSource?: { url?: string; data?: string; mediaType?: string };
  messageId?: string;
};

export async function runAgentV3Turn(input: OrchestratorInputV3) {
  const {
    userId,
    workspaceId: inputWorkspaceId,
    conversationId,
    message,
    history,
    historyTelemetry,
    anthropicApiKey,
    extraContext,
    customModules,
    enabledModules,
    businessDecision,
    funnelAlreadyCompleted,
    customerLifecycle,
    repurchasePotential,
    inputKind,
    imageSource,
    messageId,
    phone,
  } = input;

  const workspaceId = inputWorkspaceId?.trim();
  if (!workspaceId) {
    throw new Error("[agent-v3] workspaceId é obrigatório; o V3 não usa fallback entre workspaces");
  }

  const activeModulesMap = await loadEnabledModulesV3(workspaceId);
  const mergedModulesMap: Record<string, LoadedModuleV3> = { ...activeModulesMap };
  for (const [rawKey, customModule] of Object.entries(customModules || {})) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const content = typeof customModule === "string" ? customModule.trim() : customModule.content?.trim();
    if (!content) continue;
    mergedModulesMap[key] = typeof customModule === "string" ? { content, source: "custom", version: "custom", routing: { alwaysLoad: false, intents: [], stages: [], platforms: [], products: [], triggers: [], dependencies: [], conflicts: [], priority: 0 } } : { ...customModule, content, source: "custom" };
  }

  const availableKeys = Object.keys(mergedModulesMap);
  const enabledKeys = enabledModules?.length ? enabledModules.map(k => k.trim().toLowerCase()).filter(k => availableKeys.includes(k)) : availableKeys;
  const selectableModules = Object.fromEntries(enabledKeys.map(k => [k, mergedModulesMap[k]]));
  
  const { selectModulesV3 } = await import("./selector/module-selector.server");
  const selection = selectModulesV3(message, history, selectableModules);
  const selectedKeys = [...selection.selectedModules];
  const selectionContext = selection.context;
  const selectionReasons = selection.selectionReasons;

  const promptWithCommercialResult = buildPromptFromModulesDetailed(selectedKeys, mergedModulesMap);
  const nonCommercialKeys = selectedKeys.filter(k => !["psicologia_vendas", "objecoes_vendas", "fechamento_vendas", "recuperacao_leads", "qualificacao_lead", "fluxo_vendas"].includes(k));
  const promptWithoutCommercialResult = buildPromptFromModulesDetailed(nonCommercialKeys, mergedModulesMap);

  const promptWithCommercial = promptWithCommercialResult.prompt;
  const promptWithoutCommercial = promptWithoutCommercialResult.prompt;
  const effectiveSelectedKeys = promptWithCommercialResult.includedKeys;

  const modulesTelemetry: ModuleTelemetry[] = effectiveSelectedKeys.map(key => {
    const mod = mergedModulesMap[key];
    const content = mod?.content || "";
    return { key, name: mod?.name || key, chars: content.length, tokens: Math.ceil(content.length / 4) };
  });

  const isImageInput = inputKind === "image";
  const availableCommercialPlatforms = enabledCommercialPlatforms(selectableModules);
  const currentBrazilDateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());

  const normalizedCustomerMessage = message.toLocaleLowerCase("pt-BR");
  const factualTriggers = ["quais sao", "quais as", "quais os", "qual o nome", "como funciona", "e seguro", "tem prova", "me mostra"];
  const isSpecificFactualQuery = factualTriggers.some(t => normalizedCustomerMessage.includes(t));
  const shouldSuppressCommercialContext = isSpecificFactualQuery && !selectionContext.hasQuantity && selectionContext.intent !== "pagamento";
  const finalModulePrompt = shouldSuppressCommercialContext ? promptWithoutCommercial : promptWithCommercial;

  const model = isImageInput ? "claude-3-5-sonnet-20240620" : "claude-3-haiku-20240307";

  const systemPrompt = [
    {
      type: "text",
      text: `HORÁRIO: ${currentBrazilDateTime}\n\n${MIND_OPERATIONAL_TRUTH_V3}\n\nESTADO:\n${finalModulePrompt}\n\n${extraContext || ""}\n\nREGRAS: Use apenas os módulos. Seja conciso (WhatsApp). Se o cliente pediu preço de uma rede, mande a tabela completa daquela rede.`,
      cache_control: { type: "ephemeral" }
    }
  ];

  const llmResult = await callAnthropicV3({
    apiKey: anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    system: systemPrompt,
    messages: [...history.map(m => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content })), { role: "user", content: isImageInput ? [{ type: "image", source: { type: "base64", media_type: imageSource?.mediaType || "image/jpeg", data: imageSource?.data } }, { type: "text", text: message }] : message }],
    model,
    metadata: { message_id: messageId, call_number: 1, selectedKeys: effectiveSelectedKeys }
  });

  const rawText = extractAnthropicTextV3(llmResult);
  const latency_ms = Date.now(); // simplified

  const usageRaw = llmResult.usage || {};
  const input_tokens = usageRaw.input_tokens || 0;
  const output_tokens = usageRaw.output_tokens || 0;
  const cache_creation_input_tokens = usageRaw.cache_creation_input_tokens || 0;
  const cache_read_input_tokens = usageRaw.cache_read_input_tokens || 0;

  const pricing = model.includes("sonnet")
    ? { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
    : { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 };

  const input_usd = (input_tokens * pricing.input) / 1000000;
  const output_usd = (output_tokens * pricing.output) / 1000000;
  const total_usd = input_usd + output_usd;

  const finalContent = sanitizeSystemLeaks(rawText);
  const replies = autoSplitLongPartsV3(finalContent);

  return {
    response: finalContent,
    replies,
    intelligence: { intent: selectionContext.intent, stage: selectionContext.stage, confidence: "Alta", purchase_probability: 50, sentiment: "Neutro", urgency: "Media", recommended_action: "Continuar", reasoning: "OK", temperature: "morno" },
    usage: { model, request_id: llmResult.request_id || "unknown", input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, latency_ms: 0 },
    cost: { input_usd, output_usd, cache_usd: 0, total_usd },
    modules: { selected_keys: effectiveSelectedKeys, selection_context: selectionContext, selection_reasons: selectionReasons },
    score: { total: 0 },
    rawPrompt: systemPrompt
  };
}
