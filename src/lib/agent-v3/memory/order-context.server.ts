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

export type OrderContext = {
  platform: ConversationContext["platform"];
  service: ConversationContext["product"];
  quantity: number | null;
  music: string | null;
  artist: string | null;
  goal: string | null;
  link: string | null;
  paymentStatus: "nao_iniciado" | "sinalizado" | "confirmado_pelo_cliente";
  missingFields: Array<"platform" | "service" | "quantity">;
  readyForQuote: boolean;
  readyForPayment: boolean;
};

export const EMPTY_ORDER_CONTEXT: OrderContext = {
  platform: null,
  service: null,
  quantity: null,
  music: null,
  artist: null,
  goal: null,
  link: null,
  paymentStatus: "nao_iniciado",
  missingFields: ["platform", "service", "quantity"],
  readyForQuote: false,
  readyForPayment: false,
};

const PLATFORM_LINK_PATTERNS: RegExp[] = [
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

  const conversationContext = detectConversationContext(text, history, {
    platform: previous.platform ?? undefined,
    product: previous.service ?? undefined,
  });

  const facts = extractConversationFactsV3(text, previousFacts);

  const quantity = extractQuantity(text) ?? previous.quantity;
  const link = extractLink(text) ?? previous.link;
  const paymentStatus = detectPaymentStatus(text, previous.paymentStatus);

  const platform = conversationContext.platform ?? previous.platform;
  const service = conversationContext.product ?? previous.service;

  const missingFields: OrderContext["missingFields"] = [];
  if (!platform) missingFields.push("platform");
  if (!service) missingFields.push("service");
  if (!quantity) missingFields.push("quantity");

  return {
    platform,
    service,
    quantity,
    music: facts.musicTitle,
    artist: facts.artistName,
    goal: facts.objective,
    link,
    paymentStatus,
    missingFields,
    readyForQuote: Boolean(platform && service),
    readyForPayment: Boolean(platform && service && quantity),
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
