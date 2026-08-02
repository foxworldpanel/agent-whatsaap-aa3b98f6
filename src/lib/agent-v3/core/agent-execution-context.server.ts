// buildAgentExecutionContext — CORE da V3. Ponto único de preparação do
// contexto de execução do agente. Não pertence ao Playground nem ao
// WhatsApp — pertence ao núcleo, pra qualquer canal (Playground, WhatsApp,
// e futuros como Instagram/Telegram/Widget) usar a mesma fonte.
//
// ESTADO ATUAL (deliberadamente incremental):
// - O parâmetro `mode` já existe na assinatura, preparado pro futuro.
// - Modo "whatsapp" ainda NÃO é chamado pelo webhook real — o webhook
//   continua com sua lógica própria por enquanto (decisão de segurança:
//   evitar mexer no fluxo que acabou de estabilizar depois de um dia
//   inteiro de correções críticas).
// - Modo "playground" é o único em uso ativo nesta entrega.
// - Quando o WhatsApp for migrado pra usar esta função (sprint futura,
//   feita com cautela e testada em paralelo antes de substituir o fluxo
//   real), o modo "whatsapp" ativa reconcile() com o estado anterior
//   persistido — algo que sessões de Playground não têm.

import {
  deriveBusinessDecisionV3,
  enrichBusinessDecisionV3,
  reconcileBusinessDecisionV3,
  businessDecisionToPromptV3,
  type BusinessDecisionV3,
} from "./brain/business-state.server";

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
  // Só usado no modo "whatsapp" — decisão anterior persistida, pra
  // reconcile() suavizar a transição de estado. Playground não tem isso.
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

  // Reconcile só faz sentido quando existe estado anterior persistido —
  // hoje isso só está disponível de verdade no fluxo do WhatsApp.
  if (mode === "whatsapp" && previousBusinessDecision) {
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
