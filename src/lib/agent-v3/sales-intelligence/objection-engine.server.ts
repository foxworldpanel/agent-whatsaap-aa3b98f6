// Objection Engine — Sales Intelligence V1, Fase B
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A.
//
// LACUNA HONESTA: QUALITY e RISK foram pedidos no escopo, mas nenhum
// SalesSignalType da Fase A carrega evidência que sustente essas duas
// categorias especificamente — os sinais existentes cobrem preço,
// pagamento, prazo e confiança, não qualidade do serviço nem risco em
// geral (fora do que ASKED_TRUST já cobre). Os dois valores continuam
// declarados no tipo, mas esta implementação NUNCA os produz. Se
// precisarem de verdade, a Fase A precisaria ganhar um SalesSignalType
// novo primeiro (ex: ASKED_QUALITY), não algo pra inventar aqui.

import type { SalesSignal } from "./sales-intelligence-engine.server";

export type ObjectionCategory = "PRICE" | "TRUST" | "DELIVERY_TIME" | "QUALITY" | "RISK";

export type Objection = {
  category: ObjectionCategory;
  reason: string;
};

function hasSignal(signals: SalesSignal[], type: SalesSignal["type"]): boolean {
  return signals.some((s) => s.type === type);
}

/**
 * Identifica objeções usando só os sinais já coletados. TRUST é
 * inferida direto de ASKED_TRUST (a pergunta em si já é a objeção).
 * PRICE e DELIVERY_TIME exigem hesitação combinada com a pergunta
 * correspondente — perguntar preço sozinho não é objeção, é
 * qualificação normal.
 */
export function detectObjections(signals: SalesSignal[]): Objection[] {
  const objections: Objection[] = [];

  if (hasSignal(signals, "ASKED_TRUST")) {
    objections.push({ category: "TRUST", reason: "ASKED_TRUST" });
  }

  const hesitating = hasSignal(signals, "HESITATING");

  if (hesitating && hasSignal(signals, "ASKED_PRICE")) {
    objections.push({ category: "PRICE", reason: "HESITATING_AFTER_PRICE" });
  }

  if (hesitating && hasSignal(signals, "ASKED_DELIVERY_TIME")) {
    objections.push({ category: "DELIVERY_TIME", reason: "HESITATING_AFTER_DELIVERY_TIME" });
  }

  return objections;
}
