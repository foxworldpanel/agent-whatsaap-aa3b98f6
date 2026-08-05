// Lead Temperature Engine — Sales Intelligence V1, Fase B
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A. Nunca
// reprocessa a mensagem, nunca usa IA, nunca acessa banco/histórico.
//
// LACUNA HONESTA: CUSTOMER e RETURNING_CUSTOMER foram pedidos no
// escopo, mas nenhum SalesSignalType da Fase A carrega evidência de
// "já comprou antes" ou "é cliente recorrente" — isso exigiria dado de
// histórico de compra (CRM/banco), que este engine não recebe por
// design. Os dois valores continuam declarados no tipo (pra não
// quebrar o contrato pedido), mas esta implementação NUNCA os produz —
// sempre retornam como não aplicável. Documentado aqui pra não virar
// "bug silencioso" quando alguém notar que nunca aparecem.

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
 * CUSTOMER/RETURNING_CUSTOMER nunca são retornados nesta versão — ver
 * nota no topo do arquivo.
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
