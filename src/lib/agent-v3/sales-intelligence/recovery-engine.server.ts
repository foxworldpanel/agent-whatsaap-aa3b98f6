// Recovery Engine — Sales Intelligence V1, Fase B
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A.
//
// LACUNA HONESTA, a mais importante desta sprint: dos 3 exemplos dados
// no escopo ("abandonou conversa", "respondeu vou pensar", "ficou
// inativo"), só o segundo é derivável de SalesSignal[] puro — é
// literalmente o HESITATING já detectado na Fase A. "Abandonou
// conversa" e "ficou inativo" exigem informação de TEMPO (timestamp da
// última mensagem, silêncio prolongado) que não existe em
// SalesSignal[] — isso é dado de sessão/histórico, não sinal extraído
// de texto. Detectar esses dois exigiria um input novo (ex:
// lastMessageAt, ou o próprio histórico com timestamps), fora do
// escopo desta função pura.
//
// 21/08/2026 — adicionado CUSTOMER_LOST_CONTEXT: cliente sinalizando
// que já explicou/perdeu paciência com repetição (sinal LOST_CONTEXT,
// achado em conversa real). Continua função pura, só consome sinal já
// produzido na Fase A — nenhuma mudança de arquitetura.

import type { SalesSignal } from "./sales-intelligence-engine.server";

export type RecoveryReason = "CUSTOMER_HESITATED" | "CUSTOMER_LOST_CONTEXT" | "NONE";

export type RecoveryStatus = {
  needsRecovery: boolean;
  reason: RecoveryReason;
};

function hasSignal(signals: SalesSignal[], type: SalesSignal["type"]): boolean {
  return signals.some((s) => s.type === type);
}

export function evaluateRecoveryStatus(signals: SalesSignal[]): RecoveryStatus {
  if (hasSignal(signals, "LOST_CONTEXT")) {
    return { needsRecovery: true, reason: "CUSTOMER_LOST_CONTEXT" };
  }
  if (hasSignal(signals, "HESITATING")) {
    return { needsRecovery: true, reason: "CUSTOMER_HESITATED" };
  }
  return { needsRecovery: false, reason: "NONE" };
}