// Flow Engine V1 — decide determinísticamente o próximo passo do fluxo
// comercial, a partir do OrderContext + BusinessDecision.
//
// REGRA DE ARQUITETURA (mesmo princípio do Smart Router): este módulo
// NUNCA chama IA, nunca envia mensagem, nunca conhece Uazapi/Supabase.
// Só recebe dois objetos e devolve uma decisão. Puro, testável,
// reutilizável em qualquer canal.
//
// FASE 1 — modo sombra: o resultado daqui ainda NÃO influencia nenhuma
// resposta real. Só é logado, pra comparar com o comportamento atual
// (hoje quem decide isso, na prática, é o próprio Claude lendo o prompt).

import type { OrderContext } from "../memory/order-context.server";
import type { BusinessDecisionV3 } from "../brain/business-state.server";

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

export type FlowEngineResult = {
  nextAction: FlowEngineAction;
  missingFields: OrderContext["missingFields"];
  canQuote: boolean;
  canCheckout: boolean;
  canFinish: boolean;
  reason: string;
};

export function evaluateFlow(
  orderContext: OrderContext,
  businessDecision: BusinessDecisionV3,
): FlowEngineResult {
  const missingFields = orderContext.missingFields;
  const canQuote = orderContext.readyForQuote;
  const canCheckout = orderContext.readyForPayment;
  const canFinish =
    orderContext.paymentStatus === "confirmado_pelo_cliente" ||
    businessDecision.state === "pedido_realizado";

  // Estados de negócio que sempre têm prioridade sobre o fluxo de coleta
  // de dados do pedido — risco/pós-venda/handoff não seguem a esteira
  // "pergunta o que falta".
  if (businessDecision.shouldHandoff) {
    return {
      nextAction: "HUMAN_HANDOFF",
      missingFields,
      canQuote,
      canCheckout,
      canFinish,
      reason: `BusinessDecision sinalizou handoff (state=${businessDecision.state})`,
    };
  }

  if (businessDecision.state === "pos_venda" || businessDecision.state === "pedido_realizado") {
    return {
      nextAction: "POST_SALE",
      missingFields,
      canQuote,
      canCheckout,
      canFinish: true,
      reason: `Estado de negócio é pós-venda (state=${businessDecision.state})`,
    };
  }

  if (businessDecision.state === "pagamento" || orderContext.paymentStatus === "sinalizado") {
    return {
      nextAction: "GUIDE_CHECKOUT",
      missingFields,
      canQuote,
      canCheckout,
      canFinish,
      reason: "Cliente sinalizou intenção de pagamento",
    };
  }

  if (orderContext.paymentStatus === "confirmado_pelo_cliente") {
    return {
      nextAction: "CONFIRM_PAYMENT",
      missingFields,
      canQuote,
      canCheckout,
      canFinish: true,
      reason: "Cliente confirmou pagamento",
    };
  }

  // Esteira de coleta de dados do pedido — só avança se o estado de
  // negócio permitir qualificação (evita voltar pra perguntar plataforma
  // no meio de um fechamento já avançado).
  if (businessDecision.allowQualification) {
    if (missingFields.includes("platform")) {
      return {
        nextAction: "ASK_PLATFORM",
        missingFields,
        canQuote,
        canCheckout,
        canFinish,
        reason: "Falta identificar a plataforma",
      };
    }
    if (missingFields.includes("service")) {
      return {
        nextAction: "ASK_SERVICE",
        missingFields,
        canQuote,
        canCheckout,
        canFinish,
        reason: "Plataforma conhecida, falta o serviço",
      };
    }
    if (missingFields.includes("quantity")) {
      return {
        nextAction: "ASK_QUANTITY",
        missingFields,
        canQuote,
        canCheckout,
        canFinish,
        reason: "Plataforma e serviço conhecidos, falta quantidade",
      };
    }
  }

  if (canQuote) {
    return {
      nextAction: "OFFER_QUOTE",
      missingFields,
      canQuote,
      canCheckout,
      canFinish,
      reason: "Plataforma e serviço conhecidos — pronto pra mostrar preço",
    };
  }

  // Nenhuma regra determinística se aplica — conversa livre, segue com
  // o Claude decidindo tudo (comportamento atual, sem mudança).
  return {
    nextAction: "FREEFORM",
    missingFields,
    canQuote,
    canCheckout,
    canFinish,
    reason: "Nenhuma regra determinística se aplica; Claude decide",
  };
}
