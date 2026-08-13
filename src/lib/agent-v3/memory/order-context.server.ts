// OrderContext V3 — camada de representação estruturada do pedido atual.
//
// IMPORTANTE: esta camada NÃO DECIDE NADA. Ela só extrai e representa o
// estado atual do pedido (o que já se sabe, o que ainda falta). Não é
// chamada por nenhum fluxo existente ainda — é aditiva e isolada, pronta
// pra ser usada futuramente pelo BusinessDecision e por um eventual
// Conversation Router, sem alterar nenhum comportamento hoje.
//
// Reaproveita, em vez de duplicar:
// - detectConversationContext (platform, product) — já existe e funciona bem
// - extractConversationFactsV3 (musicTitle, artistName, objective) — idem
// Só adiciona o que genuinamente não existia: quantity (valor numérico,
// não só booleano), link, paymentStatus, e o cálculo de missingFields.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePhoneV3 } from "./conversation-state.server";
import {
  detectConversationContext,
  type ConversationContext,
  type ConversationMessageV3,
} from "../selector/module-selector.server";
import {
  extractConversationFactsV3,
  EMPTY_CONVERSATION_FACTS_V3,
  type ConversationFactsV3,
} from "./conversation-facts.server";

export type OrderContextFieldSource = "conversation" | "memory" | "crm" | "catalog" | "manual";

export type OrderContextFieldConfidence = {
  platform: number;
  service: number;
  quantity: number;
  goal: number;
  artist: number;
  music: number;
};

export type OrderContext = {
  version: number;
  platform: ConversationContext["platform"];
  service: ConversationContext["product"];
  quantity: number | null;
  music: string | null;
  artist: string | null;
  goal: string | null;
  link: string | null;
  paymentStatus: "nao_iniciado" | "sinalizado" | "confirmado_pelo_cliente";
  missingFields: Array<"platform" | "service" | "quantity">;
  completedFields: Array<"platform" | "service" | "quantity" | "music" | "artist" | "link">;
  readyForQuote: boolean;
  readyForPayment: boolean;
  lastQuestionAsked: "platform" | "service" | "quantity" | null;
  nextExpectedField: "platform" | "service" | "quantity" | null;
  confidence: number;
  fieldConfidence: OrderContextFieldConfidence;
  source: OrderContextFieldSource;
  needsUpdate: boolean;
  updatedAt: string;
};

export const ORDER_CONTEXT_VERSION = 1;

const EMPTY_FIELD_CONFIDENCE: OrderContextFieldConfidence = {
  platform: 0,
  service: 0,
  quantity: 0,
  goal: 0,
  artist: 0,
  music: 0,
};

export const EMPTY_ORDER_CONTEXT: OrderContext = {
  version: ORDER_CONTEXT_VERSION,
  platform: null,
  service: null,
  quantity: null,
  music: null,
  artist: null,
  goal: null,
  link: null,
  paymentStatus: "nao_iniciado",
  missingFields: ["platform", "service", "quantity"],
  completedFields: [],
  readyForQuote: false,
  readyForPayment: false,
  lastQuestionAsked: null,
  nextExpectedField: "platform",
  confidence: 0,
  fieldConfidence: EMPTY_FIELD_CONFIDENCE,
  source: "conversation",
  needsUpdate: false,
  updatedAt: new Date(0).toISOString(),
};

const FIELD_QUESTION_PATTERNS: Record<"platform" | "service" | "quantity", RegExp> = {
  platform: /\b(qual|para qual)\s+(plataforma|rede)\b|\bspotify.{0,10}youtube\b/i,
  service: /\b(qual|que)\s+servi[cç]o\b|\bplays.{0,10}(seguidores|ouvintes|saves)\b/i,
  quantity: /\b(quantos?|qual\s+quantidade)\b/i,
};

// Detecta, a partir da ÚLTIMA mensagem do AGENTE (não do cliente), qual
// campo provavelmente foi perguntado — usado só pra registrar lastQuestionAsked.
function detectLastQuestionAsked(
  history: ConversationMessageV3[],
): "platform" | "service" | "quantity" | null {
  const lastAgentMessage = [...history].reverse().find((item) => item.role === "agent");
  if (!lastAgentMessage) return null;
  const text = lastAgentMessage.content;
  if (FIELD_QUESTION_PATTERNS.quantity.test(text)) return "quantity";
  if (FIELD_QUESTION_PATTERNS.platform.test(text)) return "platform";
  if (FIELD_QUESTION_PATTERNS.service.test(text)) return "service";
  return null;
}

function computeFieldConfidence(
  ctx: Pick<OrderContext, "platform" | "service" | "quantity" | "goal" | "artist" | "music">,
): OrderContextFieldConfidence {
  // Campos extraídos com padrão direto (regex específico) = confiança alta.
  // Campos ainda ausentes = 0. Isso é um sinal simples, não é ciência exata.
  return {
    platform: ctx.platform ? 1 : 0,
    service: ctx.service ? 1 : 0,
    quantity: ctx.quantity ? 1 : 0,
    goal: ctx.goal ? 0.7 : 0, // objetivo é texto livre, menos preciso que plataforma/serviço
    artist: ctx.artist ? 0.9 : 0,
    music: ctx.music ? 0.9 : 0,
  };
}

function computeConfidence(fieldConfidence: OrderContextFieldConfidence): number {
  const relevant = [fieldConfidence.platform, fieldConfidence.service, fieldConfidence.quantity];
  const avg = relevant.reduce((sum, v) => sum + v, 0) / relevant.length;
  return Math.round(avg * 100) / 100;
}
const PLATFORM_LINK_PATTERNS = [
  /https?:\/\/(?:open\.)?spotify\.com\/[^\s]+/i,
  /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i,
  /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i,
  /https?:\/\/(?:www\.)?tiktok\.com\/[^\s]+/i,
  /https?:\/\/(?:www\.)?kwai\.com\/[^\s]+/i,
  /https?:\/\/(?:www\.)?facebook\.com\/[^\s]+/i,
];

// Extração de quantidade: só considera números plausíveis de pedido
// (dentro de uma faixa razoável) pra evitar capturar números soltos sem
// relação (tipo parte de um link, hora, CEP). Prioriza número seguido ou
// precedido de palavra de serviço/contexto comercial.
function extractQuantity(text: string): number | null {
  const normalized = String(text || "").toLowerCase();

  // "1000", "1.000", "500" — número puro plausível de pedido (100 a 500000)
  const matches = [...normalized.matchAll(/\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(mil|k)?\b/g)];
  for (const match of matches) {
    let value = parseInt(match[1].replace(/[.,]/g, ""), 10);
    if (match[2]) value *= 1000; // "1 mil" = 1000, "2k" = 2000
    if (Number.isFinite(value) && value >= 50 && value <= 500000) {
      return value;
    }
  }
  return null;
}

function extractLink(text: string): string | null {
  for (const pattern of PLATFORM_LINK_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function detectPaymentStatus(
  text: string,
  previous: OrderContext["paymentStatus"],
): OrderContext["paymentStatus"] {
  const normalized = String(text || "").toLowerCase();
  if (/\b(ja paguei|ja comprei|paguei|comprei|pagamento feito|pedido feito|deu certo|funcionou)\b/.test(normalized)) {
    return "confirmado_pelo_cliente";
  }
  if (/\b(manda o pix|quero pagar|onde pago|vou pagar|qual o pix)\b/.test(normalized)) {
    return "sinalizado";
  }
  return previous;
}

/**
 * Deriva o OrderContext a partir da mensagem atual, histórico e estado
 * anterior. Pura função de extração — não decide próximo passo, não
 * altera comportamento do agente. Uso futuro: alimentar BusinessDecision
 * e um eventual Conversation Router.
 */
export function deriveOrderContextV3(
  message: string,
  history: ConversationMessageV3[] = [],
  previous: OrderContext = EMPTY_ORDER_CONTEXT,
  previousFacts: ConversationFactsV3 = EMPTY_CONVERSATION_FACTS_V3,
): OrderContext {
  const text = String(message || "");

  // Tópico da conversa (para lastTopic)
  const conversationContext = detectConversationContext(text, history, {
    platform: previous.platform ?? undefined,
    product: previous.service ?? undefined,
  });

  // Extração de fatos (inclui salesIntent, objectionType, budgetMentioned)
  const facts = extractConversationFactsV3(text, previousFacts);
  
  // Atualiza lastTopic se a intenção for clara
  if (conversationContext.intent !== "desconhecido") {
    facts.lastTopic = conversationContext.intent;
  }

  const quantity = extractQuantity(text) ?? previous.quantity;
  const link = extractLink(text) ?? previous.link;
  const paymentStatus = detectPaymentStatus(text, previous.paymentStatus);

  const platform = conversationContext.platform ?? previous.platform;
  const service = conversationContext.product ?? previous.service;

  const missingFields: OrderContext["missingFields"] = [];
  if (!platform) missingFields.push("platform");
  if (!service) missingFields.push("service");
  if (!quantity) missingFields.push("quantity");

  const completedFields: OrderContext["completedFields"] = [];
  if (platform) completedFields.push("platform");
  if (service) completedFields.push("service");
  if (quantity) completedFields.push("quantity");
  if (facts.musicTitle) completedFields.push("music");
  if (facts.artistName) completedFields.push("artist");
  if (link) completedFields.push("link");

  const baseResult = {
    platform,
    service,
    quantity,
    music: facts.musicTitle,
    artist: facts.artistName,
    goal: facts.objective,
    link,
    paymentStatus,
    missingFields,
    completedFields,
    readyForQuote: Boolean(platform && service),
    readyForPayment: Boolean(platform && service && quantity),
    lastQuestionAsked: detectLastQuestionAsked(history),
    nextExpectedField: (missingFields[0] ?? null) as OrderContext["nextExpectedField"],
  };

  const fieldConfidence = computeFieldConfidence(baseResult);

  // needsUpdate: true se algum campo relevante mudou em relação ao estado
  // anterior — permite ao Router (futuro) decidir "nada mudou, não precisa
  // salvar de novo", economizando escrita no banco.
  const needsUpdate =
    baseResult.platform !== previous.platform ||
    baseResult.service !== previous.service ||
    baseResult.quantity !== previous.quantity ||
    baseResult.link !== previous.link ||
    baseResult.paymentStatus !== previous.paymentStatus;

  return {
    ...baseResult,
    version: ORDER_CONTEXT_VERSION,
    confidence: computeConfidence(fieldConfidence),
    fieldConfidence,
    source: "conversation",
    needsUpdate,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Representação em texto do OrderContext, pra uso futuro em prompt ou log
 * — não é usada em nenhum lugar ainda.
 */
export function orderContextSummaryV3(ctx: OrderContext): string {
  const known: string[] = [];
  if (ctx.platform) known.push(`plataforma: ${ctx.platform}`);
  if (ctx.service) known.push(`serviço: ${ctx.service}`);
  if (ctx.quantity) known.push(`quantidade: ${ctx.quantity}`);
  if (ctx.music) known.push(`música: ${ctx.music}`);
  if (ctx.artist) known.push(`artista: ${ctx.artist}`);
  if (ctx.link) known.push(`link: ${ctx.link}`);
  if (ctx.paymentStatus !== "nao_iniciado") known.push(`pagamento: ${ctx.paymentStatus}`);

  return [
    known.length > 0 ? `Já sabemos: ${known.join(", ")}.` : "Nada conhecido ainda sobre o pedido.",
    ctx.missingFields.length > 0 ? `Falta: ${ctx.missingFields.join(", ")}.` : "Todos os campos essenciais preenchidos.",
  ].join(" ");
}

// ============================================================
// PERSISTÊNCIA — mesmo padrão de conversation-state.server.ts
// ============================================================
// Guardado numa coluna JSONB própria (order_context) na mesma tabela
// conversations_v3, usando workspace_id + phone como chave — não cria
// tabela nova, só estende a existente.

function isValidOrderContext(value: unknown): value is OrderContext {
  return Boolean(value && typeof value === "object" && "missingFields" in (value as object));
}

/**
 * Carrega o OrderContext salvo. Em caso de QUALQUER erro (coluna não
 * existe ainda, linha não encontrada, etc.), retorna o EMPTY_ORDER_CONTEXT
 * silenciosamente — nunca lança exceção, pra nunca quebrar o fluxo
 * principal do agente.
 */
export async function loadOrderContextV3(
  phone: string,
  workspaceId: string,
): Promise<OrderContext> {
  try {
    const normalizedPhone = normalizePhoneV3(phone);
    const { data, error } = await (supabaseAdmin as any)
      .from("conversations_v3")
      .select("order_context")
      .eq("workspace_id", workspaceId)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (error) {
      console.warn("[ORDER-CONTEXT] Falha ao carregar (não bloqueia o fluxo):", error.message);
      return EMPTY_ORDER_CONTEXT;
    }
    const stored = (data as any)?.order_context;
    if (isValidOrderContext(stored)) return stored;
    return EMPTY_ORDER_CONTEXT;
  } catch (e) {
    console.warn("[ORDER-CONTEXT] Exceção ao carregar (não bloqueia o fluxo):", e);
    return EMPTY_ORDER_CONTEXT;
  }
}

/**
 * Salva o OrderContext atualizado. Em caso de QUALQUER erro, apenas loga
 * um aviso — nunca lança exceção, nunca bloqueia o envio da resposta do
 * agente ao cliente. Persistência do OrderContext é "best effort" por
 * design nesta fase (fase de observação, ainda não influencia decisão).
 */
export async function saveOrderContextV3(
  phone: string,
  workspaceId: string,
  userId: string,
  context: OrderContext,
): Promise<void> {
  try {
    const normalizedPhone = normalizePhoneV3(phone);
    const { error } = await (supabaseAdmin as any).from("conversations_v3").upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        phone: normalizedPhone,
        order_context: context as any,
      },
      { onConflict: "workspace_id, phone" },
    );
    if (error) {
      console.warn("[ORDER-CONTEXT] Falha ao salvar (não bloqueia o fluxo):", error.message);
    }
  } catch (e) {
    console.warn("[ORDER-CONTEXT] Exceção ao salvar (não bloqueia o fluxo):", e);
  }
}
