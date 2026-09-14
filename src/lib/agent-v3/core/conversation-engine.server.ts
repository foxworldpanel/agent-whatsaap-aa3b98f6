// src/lib/agent-v3/core/conversation-engine.server.ts

export interface ConversationStateV1 {
  greetingAlreadyDone: boolean;
  lastAgentAction: string | null;
  currentTopic: string | null;
  currentIntent: "compra" | "pagamento" | "suporte" | "dúvida" | "reclamação" | "orçamento" | "desconhecido";
  pendingQuestion: string | null;
  sessionRestart: boolean;
  conversationAgeHours: number;
  currentTopicSource: "detected" | "persisted" | "none";
}

export function detectConversationState(params: {
  message: string;
  history: Array<{ role: "agent" | "customer"; content: string; timestamp?: string }>;
  previousState?: ConversationStateV1;
  sessionTimeoutHours?: number;
}): ConversationStateV1 {
  const { message, history, previousState, sessionTimeoutHours = 24 } = params;
  const agentMessages = history.filter(m => m.role === "agent");
  const lastMsgTimestamp = history.length > 0 && history[history.length - 1].timestamp
    ? new Date(history[history.length - 1].timestamp as string).getTime()
    : Date.now();
  const conversationAgeHours = history.length > 0 && history[0].timestamp
    ? (Date.now() - new Date(history[0].timestamp as string).getTime()) / (1000 * 60 * 60)
    : 0;
  const idleTimeHours = (Date.now() - lastMsgTimestamp) / (1000 * 60 * 60);
  const sessionRestart = idleTimeHours > sessionTimeoutHours;
  const greetingAlreadyDone = agentMessages.length > 0 && !sessionRestart;
  const lastAgentAction = agentMessages.length > 0
    ? (agentMessages[agentMessages.length - 1].content || "").slice(0, 200)
    : null;

  let currentTopic = null;
  let currentIntent: ConversationStateV1["currentIntent"] = "desconhecido";
  let currentTopicSource: "detected" | "persisted" | "none" = "none";
  const normalizedMsg = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/spotify/i.test(normalizedMsg)) currentTopic = "spotify";
  else if (/youtube|video/i.test(normalizedMsg)) currentTopic = "youtube";
  else if (/instagram|seguidores/i.test(normalizedMsg)) currentTopic = "instagram";
  else if (/tiktok/i.test(normalizedMsg)) currentTopic = "tiktok";
  else if (/kwai/i.test(normalizedMsg)) currentTopic = "kwai";
  else if (/facebook/i.test(normalizedMsg)) currentTopic = "facebook";

  // Pós-venda precisa ganhar de palavras genéricas como "pagamento" e "pix".
  // Sem isso, "meu pagamento não caiu" era classificado como pagamento comercial
  // e podia voltar para o fluxo de venda em vez de orientar o ticket de suporte.
  const postSaleSupport =
    /(?:pedido|ordem|recarga|saldo|pagamento|pix).{0,50}(?:nao\s+(?:caiu|entrou|chegou|creditou)|nao\s+foi|pendente|atrasad|problema|erro|estorno|reembolso|reposi(?:cao|c)|refill|nao\s+(?:entregou|completou|iniciou))/i.test(normalizedMsg) ||
    /(?:nao\s+(?:caiu|entrou|chegou|creditou)|pendente|atrasad|estorno|reembolso|reposi(?:cao|c)|refill).{0,50}(?:pedido|ordem|recarga|saldo|pagamento|pix)/i.test(normalizedMsg) ||
    /(?:pedido|ordem).{0,50}(?:cancelad|incomplet|parad|nao\s+(?:entregou|completou|iniciou))/i.test(normalizedMsg);

  if (postSaleSupport) currentIntent = "suporte";
  else if (/reclamacao|reclamar|errado|falta/i.test(normalizedMsg)) currentIntent = "reclamação";
  else if (/pagamento|pix|cartao|boleto/i.test(normalizedMsg)) currentIntent = "pagamento";
  else if (/comprar|comprando|queria/i.test(normalizedMsg) && !/quanto|valor/i.test(normalizedMsg)) currentIntent = "compra";
  else if (/quanto|valor|preco|tabela|orcamento/i.test(normalizedMsg)) currentIntent = "orçamento";
  else if (/ajuda|suporte|problema|nao consigo/i.test(normalizedMsg)) currentIntent = "suporte";
  else if (/\?/.test(message) || /duvida|saber|como funciona/i.test(normalizedMsg)) currentIntent = "dúvida";

  if (currentTopic) {
    currentTopicSource = "detected";
  } else if (previousState?.currentTopic) {
    currentTopic = previousState.currentTopic;
    currentTopicSource = "persisted";
  }

  let pendingQuestion = null;
  if (agentMessages.length > 0) {
    const lastMsg = (agentMessages[agentMessages.length - 1].content || "").trim();
    const questions = lastMsg.match(/[^.!?]+\?/g);
    if (questions && questions.length > 0) pendingQuestion = questions.join(" ").trim();
  }

  return {
    greetingAlreadyDone,
    lastAgentAction,
    currentTopic,
    currentIntent,
    pendingQuestion,
    sessionRestart,
    conversationAgeHours,
    currentTopicSource
  };
}

export function conversationStateToPrompt(state: ConversationStateV1): string {
  const instructions = [
    state.greetingAlreadyDone
      ? "- DO NOT greet the customer again (no 'Olá', 'Bom dia', etc)."
      : "- Use a polite greeting (appropriate for the current time if possible).",
    state.pendingQuestion
      ? `- The customer is likely answering your specific question: "${state.pendingQuestion}". Respond directly to the answer.`
      : "",
    `- Maintain focus on the current topic: ${state.currentTopic || "general assistance"}.`,
    `- Current Intent: ${state.currentIntent}.`,
    state.currentIntent === "suporte" || state.currentIntent === "reclamação"
      ? "- If this is about an order/payment already made, do not investigate it in WhatsApp. Direct the customer to the panel Support ticket flow."
      : "",
    `- Ensure the response flows naturally from the last action: "${state.lastAgentAction || "First message"}".`
  ].filter(Boolean).join("\n");

  return `
[CONVERSATION CONTEXT]
Greeting Already Done: ${state.greetingAlreadyDone}
Session Restart: ${state.sessionRestart}
Conversation Age: ${state.conversationAgeHours.toFixed(1)}h
Last Agent Action: ${state.lastAgentAction || "None"}
Current Topic: ${state.currentTopic || "Unknown"} (Source: ${state.currentTopicSource})
Current Intent: ${state.currentIntent}
Pending Question from Agent: ${state.pendingQuestion || "None"}

INSTRUCTIONS:
${instructions}
`.trim();
}