// Sales Intelligence Engine V1 — Fase A
//
// Componente totalmente desacoplado do resto do sistema. Responsabilidade
// única nesta fase: analisar a mensagem atual e produzir sinais comerciais
// estruturados (evidência, não interpretação).
//
// AJUSTE PÓS-REVISÃO: a classificação de ConversationStage foi removida
// desta fase por decisão de arquitetura — heurísticas de estágio
// ("Spotify sozinho = QUALIFICATION", por exemplo) tendem a precisar de
// reescrita depois de analisar conversas reais. Em vez de fixar essa
// lógica agora, esta sprint entrega só a coleta bruta de sinais; a
// classificação de estágio (e temperatura do lead) fica pra Fase B,
// construída em cima dos sinais já coletados com mais evidência real.
// O tipo ConversationStage continua declarado (não removido) porque a
// Fase B vai precisar dele — só não é mais computado aqui.
//
// NESTA FASE: só classifica sinais. Nada aqui decide comportamento do
// Agent, nenhuma resposta muda, nenhum outro componente (Module
// Selector, Prompt Builder, Orchestrator, Runtime, Smart Router) é
// consultado ou alterado.
//
// REGRA DE ARQUITETURA (mesma do Smart Router): este módulo nunca
// importa Uazapi, Supabase, ou qualquer coisa de envio/persistência.
// Só recebe texto + histórico e devolve um objeto.

import { removeAccents } from "../../text-normalize";

// Declarado pra uso futuro na Fase B — não computado nesta sprint.
export type ConversationStage =
  | "GREETING"
  | "DISCOVERY"
  | "QUALIFICATION"
  | "PRESENTATION"
  | "PRICING"
  | "OBJECTION"
  | "NEGOTIATION"
  | "CLOSING"
  | "POST_SALE";

export type SalesSignalType =
  | "ASKED_PRICE"
  | "ASKED_PAYMENT"
  | "ASKED_DELIVERY_TIME"
  | "ASKED_TRUST"
  | "ASKED_TEST"
  | "MENTIONED_PLATFORM"
  | "READY_TO_BUY"
  | "HESITATING";

export type SalesSignal = {
  type: SalesSignalType;
  // Trecho da mensagem que motivou a detecção — útil pra auditoria/log,
  // sem guardar a mensagem inteira de novo.
  evidence: string;
};

export type SalesIntelligenceResult = {
  salesSignals: SalesSignal[];
};

function normalize(text: string): string {
  return removeAccents(text).toLowerCase().trim();
}

function containsAny(text: string, terms: string[]): string | null {
  for (const term of terms) {
    if (text.includes(term)) return term;
  }
  return null;
}

// Estrutura extensível — cada sinal é uma entrada simples {type, terms}.
// Adicionar um sinal novo no futuro é só adicionar uma linha aqui, sem
// tocar no resto do engine.
const SIGNAL_DETECTORS: Array<{ type: SalesSignalType; terms: string[] }> = [
  { type: "ASKED_PRICE", terms: ["preco", "valor", "quanto custa", "quanto e", "quanto fica"] },
  { type: "ASKED_PAYMENT", terms: ["pix", "pagamento", "como pago", "forma de pagamento"] },
  { type: "ASKED_DELIVERY_TIME", terms: ["prazo", "demora", "quando chega", "quanto tempo"] },
  { type: "ASKED_TRUST", terms: ["confiavel", "e seguro", "e golpe", "posso confiar", "e real"] },
  { type: "ASKED_TEST", terms: ["teste gratis", "amostra", "posso testar", "tem teste"] },
  {
    type: "MENTIONED_PLATFORM",
    terms: ["spotify", "instagram", "youtube", "tiktok", "facebook", "kwai"],
  },
  { type: "READY_TO_BUY", terms: ["quero comprar", "vou querer", "fechar pedido", "quero fechar"] },
  { type: "HESITATING", terms: ["nao sei", "vou pensar", "depois eu vejo", "depois eu volto"] },
];

function detectSalesSignals(message: string): SalesSignal[] {
  const normalized = normalize(message);
  const signals: SalesSignal[] = [];
  for (const detector of SIGNAL_DETECTORS) {
    const match = containsAny(normalized, detector.terms);
    if (match) signals.push({ type: detector.type, evidence: match });
  }
  return signals;
}

/**
 * Ponto de entrada único do engine. Puro — mesma entrada sempre produz
 * a mesma saída, sem I/O, sem efeito colateral. Nesta fase, só coleta
 * sinais — não classifica estágio (ver nota no topo do arquivo).
 */
export function classifySalesIntelligence(message: string): SalesIntelligenceResult {
  return { salesSignals: detectSalesSignals(message) };
}
