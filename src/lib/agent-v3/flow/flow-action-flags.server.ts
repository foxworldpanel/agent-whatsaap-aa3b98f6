// Feature flags do Flow Engine — controla, AÇÃO POR AÇÃO, se o Flow
// Engine já está autorizado a influenciar a resposta real, ou se ainda
// está em modo sombra (só observação).
//
// REGRA: tudo começa "false". Uma ação só vira "true" depois de
// confirmarmos precisão real (≥98-99%) em produção, medida a partir dos
// logs [FLOW-ENGINE] comparados manualmente com o que realmente
// aconteceu na conversa. Promoção é açao por ação, nunca em bloco.
//
// Pra ativar uma ação: muda o valor aqui pra "true", sobe esse arquivo
// sozinho. Não precisa mexer em mais nada.

import type { FlowEngineAction } from "./flow-engine.server";

export const FLOW_ACTIONS_ENABLED: Record<FlowEngineAction, boolean> = {
  ASK_PLATFORM: false,
  ASK_SERVICE: false,
  ASK_QUANTITY: false,
  OFFER_QUOTE: false,
  GUIDE_CHECKOUT: false,
  CONFIRM_PAYMENT: false,
  POST_SALE: false,
  HUMAN_HANDOFF: false,
  FREEFORM: false, // sempre false — FREEFORM significa "sem regra determinística", já é o Claude decidindo
};

/**
 * Retorna true se essa FlowAction específica já está autorizada a
 * influenciar a resposta real (fora do modo sombra). Enquanto false, o
 * Flow Engine continua sendo só observado/logado.
 */
export function isFlowActionEnabled(action: FlowEngineAction): boolean {
  return FLOW_ACTIONS_ENABLED[action] === true;
}
