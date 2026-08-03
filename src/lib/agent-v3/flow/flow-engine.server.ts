// Flow Engine V1 — decide determinísticamente o próximo passo do fluxo
// comercial, a partir do OrderContext + BusinessDecision.
//
// REGRA DE ARQUITETURA (mesmo princípio do Smart Router): este módulo
// NUNCA chama IA, nunca envia mensagem, nunca conhece Uazapi/Supabase.
// Só recebe dois objetos e devolve uma decisão. Puro, testável,
// reutilizável em qualquer canal (WhatsApp, Playground, futuros canais).
//
// AINDA EM MODO SOMBRA: nenhuma FlowAction está ativa em produção ainda
// (ver flow-action-flags.server.ts — tudo começa "false"). O resultado
// daqui é só logado e persistido, pra medir precisão real antes de
// qualquer ação ser promovida individualmente.

import type { OrderContext } from "../memory/order-context.server";
import type { BusinessDecisionV3 } from "../brain/business-state.server";

export const FLOW_DECISION_VERSION = 1;

export type FlowEngineAction =
  | "ASK_PLATFORM"
  | "ASK_SERVICE"
  | "ASK_QUANTITY"
  | "OFFER_QUOTE"
  | "GUIDE_CHECKOUT"
  | "CONFIRM_PAYMENT"
  | "POST_SALE"
  | "HUMAN_HANDOFF"
  | "FREEFORM"; // conversa que não se encaixa em nenhum passo determinístico — segue com o Claude decidindo tudo

// Código estável (machine-readable), pra evitar que diferentes partes do
// sistema tenham que interpretar frase livre. O campo "reason" (texto)
// continua existindo, só pra log/debug humano.
export type FlowReasonCode =
  | "HANDOFF_REQUIRED"
  | "POST_SALE_STATE"
  | "PAYMENT_SIGNALED"
  | "PAYMENT_CONFIRMED"
  | "MISSING_PLATFORM"
  | "MISSING_SERVICE"
  | "MISSING_QUANTITY"
  | "READY_TO_QUOTE"
  | "NO_DETERMINISTIC_RULE";

export type FlowDecisionPayload = {
  platform: OrderContext["platform"];
  service: OrderContext["service"];
  quantity: OrderContext["quantity"];
};

// Contrato estável — Claude, Playground, logs e qualquer canal futuro
// consomem exatamente este mesmo formato.
export type FlowDecision = {
  version: number; // permite evoluir o contrato (V2, V3...) sem quebrar quem já consome V1
  action: FlowEngineAction;
  reasonCode: FlowReasonCode;
  reason: string; // texto livre, só pra log/debug humano — não usar pra lógica
  confidence: number;
  requiredFields: OrderContext["missingFields"];
  payload: FlowDecisionPayload;
  canQuote: boolean;
  canCheckout: boolean;
  canFinish: boolean;
};

/** @deprecated use FlowDecision — mantido só pra não quebrar imports existentes */
export type FlowEngineResult = FlowDecision & { nextAction: FlowEngineAction };

function buildPayload(orderContext: OrderContext): FlowDecisionPayload {
  return {
    platform: orderContext.platform,
    service: orderContext.service,
    quantity: orderContext.quantity,
  };
}

export function evaluateFlow(
  orderContext: OrderContext,
  businessDecision: BusinessDecisionV3,
): FlowDecision {
  const missingFields = orderContext.missingFields;
  const canQuote = orderContext.readyForQuote;
  const canCheckout = orderContext.readyForPayment;
  const canFinish =
    orderContext.paymentStatus === "confirmado_pelo_cliente" ||
    businessDecision.state === "pedido_realizado";
  const payload = buildPayload(orderContext);

  const base = {
    version: FLOW_DECISION_VERSION,
    canQuote,
    canCheckout,
    canFinish,
    payload,
    requiredFields: missingFields,
  };

  if (businessDecision.shouldHandoff) {
    return {
      ...base,
      action: "HUMAN_HANDOFF",
      reasonCode: "HANDOFF_REQUIRED",
      confidence: 1,
      reason: `BusinessDecision sinalizou handoff (state=${businessDecision.state})`,
    };
  }

  if (businessDecision.state === "pos_venda" || businessDecision.state === "pedido_realizado") {
    return {
      ...base,
      action: "POST_SALE",
      reasonCode: "POST_SALE_STATE",
      confidence: 1,
      canFinish: true,
      reason: `Estado de negócio é pós-venda (state=${businessDecision.state})`,
    };
  }

  if (businessDecision.state === "pagamento" || orderContext.paymentStatus === "sinalizado") {
    return {
      ...base,
      action: "GUIDE_CHECKOUT",
      reasonCode: "PAYMENT_SIGNALED",
      confidence: 1,
      reason: "Cliente sinalizou intenção de pagamento",
    };
  }

  if (orderContext.paymentStatus === "confirmado_pelo_cliente") {
    return {
      ...base,
      action: "CONFIRM_PAYMENT",
      reasonCode: "PAYMENT_CONFIRMED",
      confidence: 1,
      canFinish: true,
      reason: "Cliente confirmou pagamento",
    };
  }

  if (businessDecision.allowQualification) {
    if (missingFields.includes("platform")) {
      return {
        ...base,
        action: "ASK_PLATFORM",
        reasonCode: "MISSING_PLATFORM",
        confidence: 1,
        reason: "Falta identificar a plataforma",
      };
    }
    if (missingFields.includes("service")) {
      return {
        ...base,
        action: "ASK_SERVICE",
        reasonCode: "MISSING_SERVICE",
        confidence: orderContext.fieldConfidence?.platform ?? 1,
        reason: "Plataforma conhecida, falta o serviço",
      };
    }
    if (missingFields.includes("quantity")) {
      return {
        ...base,
        action: "ASK_QUANTITY",
        reasonCode: "MISSING_QUANTITY",
        confidence: Math.min(
          orderContext.fieldConfidence?.platform ?? 1,
          orderContext.fieldConfidence?.service ?? 1,
        ),
        reason: "Plataforma e serviço conhecidos, falta quantidade",
      };
    }
  }

  if (canQuote) {
    return {
      ...base,
      action: "OFFER_QUOTE",
      reasonCode: "READY_TO_QUOTE",
      confidence: orderContext.confidence,
      reason: "Plataforma e serviço conhecidos — pronto pra mostrar preço",
    };
  }

  return {
    ...base,
    action: "FREEFORM",
    reasonCode: "NO_DETERMINISTIC_RULE",
    confidence: 0,
    reason: "Nenhuma regra determinística se aplica; Claude decide",
  };
}
