// Offer Engine — Sales Intelligence V1, Fase B
//
// Consome exclusivamente SalesSignal[] já produzido na Fase A. Só
// calcula ELEGIBILIDADE — nunca decide oferecer nada, nunca gera
// texto, nunca influencia resposta.

import type { SalesSignal } from "./sales-intelligence-engine.server";

export type OfferEligibility = {
  eligibleForFreeTest: boolean;
  eligibleForDiscount: boolean;
  eligibleForFollowUp: boolean;
};

function hasSignal(signals: SalesSignal[], type: SalesSignal["type"]): boolean {
  return signals.some((s) => s.type === type);
}

export function evaluateOfferEligibility(signals: SalesSignal[]): OfferEligibility {
  return {
    // Cliente perguntou diretamente sobre teste/amostra.
    eligibleForFreeTest: hasSignal(signals, "ASKED_TEST"),
    // Hesitação é o sinal clássico de "quase lá, falta um empurrão" —
    // padrão comercial comum pra considerar desconto.
    eligibleForDiscount: hasSignal(signals, "HESITATING"),
    // Mesma hesitação também qualifica pra follow-up posterior.
    eligibleForFollowUp: hasSignal(signals, "HESITATING"),
  };
}
