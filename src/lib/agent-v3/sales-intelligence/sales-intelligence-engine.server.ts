// Sales Intelligence Engine — Fase A + Fase B
//
// Ponto de entrada único da camada de inteligência comercial. Fase A
// produz os SalesSignal[] (evidência bruta, extraída da mensagem).
// Fase B consome exclusivamente esses sinais — nenhum dos 4 engines
// abaixo reprocessa a mensagem, usa IA, ou acessa banco/histórico.
//
// AJUSTE PÓS-REVISÃO (Fase A): a classificação de ConversationStage foi
// removida por decisão de arquitetura — heurísticas de estágio tendem
// a precisar de reescrita depois de analisar conversas reais. O tipo
// continua declarado pra uso futuro, não computado ainda.
//
// NESTA FASE (A+B): só classifica e produz decisões estruturadas. Nada
// aqui altera comportamento do Agent, nenhuma resposta muda, nenhum
// outro componente (Module Selector, Prompt Builder, Orchestrator,
// Runtime, Smart Router) é consultado ou alterado.
//
// REGRA DE ARQUITETURA (mesma do Smart Router): este módulo nunca
// importa Uazapi, Supabase, ou qualquer coisa de envio/persistência.

import { removeAccents } from "../../text-normalize";
import { detectObjections, type Objection } from "./objection-engine.server";
import { evaluateOfferEligibility, type OfferEligibility } from "./offer-engine.server";
import { evaluateRecoveryStatus, type RecoveryStatus } from "./recovery-engine.server";

// Declarado pra uso futuro — não computado ainda.
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
  | "HESITATING"
  | "LOST_CONTEXT";

export type SalesSignal = {
  type: SalesSignalType;
  // Trecho da mensagem que motivou a detecção — útil pra auditoria/log,
  // sem guardar a mensagem inteira de novo.
  evidence: string;
};

// BACKLOG (registrado, não implementado): este objeto tende a crescer
// (memory, lead score, recommendation, follow-up, confidence...). Quando
// isso acontecer, vale considerar nomear a composição como um tipo
// próprio (ex: SalesIntelligencePipeline ou SalesDecisionBundle) em vez
// de deixar tudo achatado num objeto só. Não bloqueia nada hoje — só
// facilita quando o objeto crescer de verdade.
// leadTemperature (HOT/WARM/COLD) foi removido daqui — descoberto em
// auditoria em 09/08/2026 que existe um sistema paralelo já em produção
// (contacts.temperatura, frio/morno/quente), visível e editável na tela
// de Contatos, usado de verdade pelo time. Manter os dois calculando a
// mesma coisa sem nunca se falar era confusão arquitetural esperando
// virar bug. contacts.temperatura é a fonte única agora.
export type SalesIntelligenceResult = {
  salesSignals: SalesSignal[];
  objections: Objection[];
  offerEligibility: OfferEligibility;
  recoveryStatus: RecoveryStatus;
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
  // Achado em conversa real em 21/08/2026: cliente disse "Le as msg
  // anteriores" e "Já testei mn...acorda" depois de repetir a mesma
  // dúvida várias vezes, e o agente continuou perguntando do zero —
  // nenhum sinal existente cobria "cliente sinalizando que já
  // explicou/perdeu paciência com repetição".
  {
    type: "LOST_CONTEXT",
    terms: [
      "leia acima",
      "le acima",
      "le as msg",
      "leia as msg",
      "msg anterior",
      "mensagens anteriores",
      "ja falei",
      "ja expliquei",
      "vou repetir",
      "vou explicar de novo",
      "explicar tudo de novo",
      "explicar td de novo",
      "acorda",
    ],
  },
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
 * a mesma saída, sem I/O, sem efeito colateral. Orquestra Fase A
 * (sinais) + Fase B (temperatura, objeções, ofertas, recuperação),
 * todos consumindo só os sinais já extraídos.
 */
export function classifySalesIntelligence(message: string): SalesIntelligenceResult {
  const salesSignals = detectSalesSignals(message);
  return {
    salesSignals,
    objections: detectObjections(salesSignals),
    offerEligibility: evaluateOfferEligibility(salesSignals),
    recoveryStatus: evaluateRecoveryStatus(salesSignals),
  };
}
