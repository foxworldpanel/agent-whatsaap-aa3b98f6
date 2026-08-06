// src/lib/agent-v3/core/conversation-engine.server.ts

export interface ConversationStateV1 {
  greetingAlreadyDone: boolean;
  lastAgentAction: string | null;
  currentTopic: string | null;
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
    ? new Date(history[history.length - 1].timestamp).getTime() 
    : Date.now();
  
  const conversationAgeHours = history.length > 0 && history[0].timestamp
    ? (Date.now() - new Date(history[0].timestamp).getTime()) / (1000 * 60 * 60)
    : 0;

  const idleTimeHours = (Date.now() - lastMsgTimestamp) / (1000 * 60 * 60);
  const sessionRestart = idleTimeHours > sessionTimeoutHours;

  // 1. Greeting Inteligente: permite nova saudação se for reinício de sessão
  const greetingAlreadyDone = agentMessages.length > 0 && !sessionRestart;

  // 2. Extrair última ação do agente
  const lastAgentAction = agentMessages.length > 0 
    ? agentMessages[agentMessages.length - 1].content.slice(0, 200)
    : null;

  // 3. Topic Persistente
  let currentTopic = null;
  let currentTopicSource: "detected" | "persisted" | "none" = "none";
  const normalizedMsg = message.toLowerCase();
  
  if (/spotify/i.test(normalizedMsg)) currentTopic = "spotify";
  else if (/youtube|video/i.test(normalizedMsg)) currentTopic = "youtube";
  else if (/instagram|seguidores/i.test(normalizedMsg)) currentTopic = "instagram";
  else if (/tiktok/i.test(normalizedMsg)) currentTopic = "tiktok";
  else if (/kwai/i.test(normalizedMsg)) currentTopic = "kwai";
  else if (/facebook/i.test(normalizedMsg)) currentTopic = "facebook";
  
  if (currentTopic) {
    currentTopicSource = "detected";
  } else if (previousState?.currentTopic && !/comercial|pagamento|pix|cartao|comprar/i.test(normalizedMsg)) {
    // Mantém o tópico anterior se não for uma mudança clara para comercial genérico
    currentTopic = previousState.currentTopic;
    currentTopicSource = "persisted";
  } else if (/pagamento|pix|cartao|comprar/i.test(normalizedMsg)) {
    currentTopic = "comercial";
    currentTopicSource = "detected";
  }

  // 4. Pending Question: Captura a pergunta inteira
  let pendingQuestion = null;
  if (agentMessages.length > 0) {
    const lastMsg = agentMessages[agentMessages.length - 1].content.trim();
    // Busca a última sentença que termina com ?
    const questions = lastMsg.match(/[^.!?]+\?/g);
    if (questions && questions.length > 0) {
      pendingQuestion = questions[questions.length - 1].trim();
    }
  }

  return {
    greetingAlreadyDone,
    lastAgentAction,
    currentTopic,
    pendingQuestion,
    sessionRestart,
    conversationAgeHours,
    currentTopicSource
  };
}

export function conversationStateToPrompt(state: ConversationStateV1): string {
  return `
[CONVERSATION CONTEXT]
Greeting Already Done: ${state.greetingAlreadyDone}
Session Restart: ${state.sessionRestart}
Conversation Age: ${state.conversationAgeHours.toFixed(1)}h
Last Agent Action: ${state.lastAgentAction || "None"}
Current Topic: ${state.currentTopic || "Unknown"} (Source: ${state.currentTopicSource})
Pending Question from Agent: ${state.pendingQuestion || "None"}

INSTRUCTIONS:
${state.greetingAlreadyDone ? "- DO NOT greet the customer again (no 'Olá', 'Bom dia', etc)." : "- Use a polite greeting (appropriate for the current time if possible)."}
${state.pendingQuestion ? `- The customer is likely answering your specific question: "${state.pendingQuestion}". Respond directly to the answer.` : ""}
- Maintain focus on the current topic: ${state.currentTopic || "general assistance"}.
- Ensure the response flows naturally from the last action: "${state.lastAgentAction || "First message"}".
`.trim();
}
