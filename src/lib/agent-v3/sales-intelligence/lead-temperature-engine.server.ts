// Lead Temperature Engine — Sales Intelligence V1, Fase B
//
// ÓRFÃO desde 09/08/2026: nada importa mais classifyLeadTemperature
// daqui. Descoberto em auditoria que existe um sistema paralelo já em
// produção de verdade — contacts.temperatura (frio/morno/quente),
// visível e editável na tela de Contatos, calculado por
// deriveTemperatureFromProbability em intelligence-utils.server.ts.
// Os dois nunca tiveram conexão de código real um com o outro, apesar
// do comentário abaixo sugerir o contrário — eram 2 cálculos
// independentes coexistindo. contacts.temperatura é a fonte única
// agora. Não removido — só documentado aqui. Remover exige confirmação
// explícita.
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A. Nunca
// reprocessa a mensagem, nunca usa IA, nunca acessa banco/histórico.

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

