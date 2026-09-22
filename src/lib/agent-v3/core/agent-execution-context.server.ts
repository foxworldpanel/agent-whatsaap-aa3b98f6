// buildAgentExecutionContext — CORE da V3. Ponto único de preparação do
// contexto de execução do agente. Não pertence ao Playground nem ao
// WhatsApp — pertence ao núcleo, pra qualquer canal (Playground, WhatsApp,
// e futuros como Instagram/Telegram/Widget) usar a mesma fonte.
//
// FONTE ÚNICA DE CONTEXTO CONVERSACIONAL:
// - Playground e WhatsApp chamam esta função antes de executeAgent().
// - O modo "whatsapp" acrescenta reconcile() com o estado persistido.
// - O Playground continua determinístico para o contexto que simula.
// - Diferenças de transporte (Uazapi, persistência, typing, delivery) ficam
//   fora deste núcleo e não criam uma segunda inteligência conversacional.

import {
  deriveBusinessDecisionV3,
  enrichBusinessDecisionV3,
  reconcileBusinessDecisionV3,
  businessDecisionToPromptV3,
  type BusinessDecisionV3,
} from "../brain/business-state.server";

export type ChatMessageLike = { role: "agent" | "customer"; content: string };

export type AgentExecutionMode = "playground" | "whatsapp";

export type AgentExecutionContext = {
  businessDecision: BusinessDecisionV3;
  extraContext: string | undefined;
  rememberedContext: { platform: string | null; product: string | null } | null;
};

export function buildAgentExecutionContext(params: {
  mode: AgentExecutionMode;
  message: string;
  history: ChatMessageLike[];
  customerLifecycle?: string | null;
  // Decisão anterior, quando o canal possui estado persistido/simulado.
  // Playground e WhatsApp podem fornecê-la para manter a mesma transição.
  previousBusinessDecision?: BusinessDecisionV3 | null;
  // Só usado no modo "whatsapp" — memória real do cliente (telefone
  // conhecido). Playground não tem contato real associado à sessão.
  rememberedContext?: { platform: string | null; product: string | null } | null;
}): AgentExecutionContext {
  const {
    mode,
    message,
    history,
    customerLifecycle,
    previousBusinessDecision,
    rememberedContext,
  } = params;

  const recentCustomerMessages = history
    .filter((item) => item.role === "customer")
    .slice(-6)
    .map((item) => item.content);

  const rawDecision = deriveBusinessDecisionV3({
    message,
    recentCustomerMessages,
    customerLifecycle: customerLifecycle ?? null,
  });

  let businessDecision = enrichBusinessDecisionV3(rawDecision, message);

  // A transição comercial é igual em qualquer canal. A diferença é apenas
  // de onde vem o estado anterior (produção no WhatsApp, sessão no Playground).
  if (previousBusinessDecision) {
    businessDecision = reconcileBusinessDecisionV3({
      previous: previousBusinessDecision,
      current: businessDecision,
      message,
    });
  }

  const extraContext = businessDecisionToPromptV3(businessDecision) || undefined;

  return {
    businessDecision,
    extraContext,
    rememberedContext: rememberedContext ?? null,
  };
}
