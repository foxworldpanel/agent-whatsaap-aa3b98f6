// Lead Temperature Engine — Sales Intelligence V1, Fase B
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A. Nunca
// reprocessa a mensagem, nunca usa IA, nunca acessa banco/histórico.
//
// REFINAMENTO: Este engine agora atua apenas como fornecedor de evidências
// baseadas em sinais semânticos. A decisão final de temperatura e
// probabilidade de compra é centralizada em intelligence-utils.server.ts
// para garantir fonte única de verdade entre Smart Router e Claude.

import type { SalesSignal } from "./sales-intelligence-engine.server";

export type LeadTemperature = "COLD" | "WARM" | "HOT" | "CUSTOMER" | "RETURNING_CUSTOMER";

export type LeadTemperatureResult = {
  temperature: LeadTemperature;
  reason: string;
};

function hasSignal(signals: SalesSignal[], type: SalesSignal["type"]): boolean {
  return signals.some((s) => s.type === type);
}

/**
 * Classifica a temperatura do lead usando só os sinais já coletados.
 * Retorna evidência qualitativa para o orquestrador/router.
 */
export function classifyLeadTemperature(signals: SalesSignal[]): LeadTemperatureResult {
  if (hasSignal(signals, "READY_TO_BUY")) {
    return { temperature: "HOT", reason: "READY_TO_BUY" };
  }

  const hasQualifyingSignal =
    hasSignal(signals, "ASKED_PRICE") ||
    hasSignal(signals, "ASKED_PAYMENT") ||
    hasSignal(signals, "ASKED_DELIVERY_TIME");

  if (hasQualifyingSignal && !hasSignal(signals, "HESITATING")) {
    return { temperature: "WARM", reason: "ASKED_QUALIFYING_QUESTION" };
  }

  if (hasSignal(signals, "HESITATING")) {
    return { temperature: "COLD", reason: "HESITATING" };
  }

  return { temperature: "COLD", reason: "NO_QUALIFYING_SIGNAL" };
}

