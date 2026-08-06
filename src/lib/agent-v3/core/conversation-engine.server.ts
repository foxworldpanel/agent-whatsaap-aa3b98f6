// src/lib/agent-v3/core/conversation-engine.server.ts

export interface ConversationStateV1 {
  greetingAlreadyDone: boolean;
  lastAgentAction: string | null;
  currentTopic: string | null;
  pendingQuestion: string | null;
}

export function detectConversationState(params: {
  message: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
}): ConversationStateV1 {
  const { message, history } = params;
  
  // 1. Detectar se saudação já foi feita (agente já falou algo que não seja erro/sistema)
  const agentMessages = history.filter(m => m.role === "agent");
  const greetingAlreadyDone = agentMessages.length > 0;

  // 2. Extrair última ação do agente
  const lastAgentAction = agentMessages.length > 0 
    ? agentMessages[agentMessages.length - 1].content.slice(0, 100)
    : null;

  // 3. Detectar tópico atual (heurística simples por palavras-chave)
  let currentTopic = null;
  const normalizedMsg = message.toLowerCase();
  if (/spotify/i.test(normalizedMsg)) currentTopic = "spotify";
  else if (/youtube|video/i.test(normalizedMsg)) currentTopic = "youtube";
  else if (/instagram|seguidores/i.test(normalizedMsg)) currentTopic = "instagram";
  else if (/pagamento|pix|cartao|comprar/i.test(normalizedMsg)) currentTopic = "comercial";

  // 4. Detectar pergunta pendente (se a última mensagem do agente terminou com ?)
  let pendingQuestion = null;
  if (agentMessages.length > 0) {
    const lastMsg = agentMessages[agentMessages.length - 1].content.trim();
    if (lastMsg.endsWith("?")) {
      pendingQuestion = lastMsg.split(/[.!?]+/).pop()?.trim() + "?" || lastMsg;
    }
  }

  return {
    greetingAlreadyDone,
    lastAgentAction,
    currentTopic,
    pendingQuestion
  };
}

export function conversationStateToPrompt(state: ConversationStateV1): string {
  return `
[CONVERSATION CONTEXT]
Greeting Already Done: ${state.greetingAlreadyDone}
Last Agent Action: ${state.lastAgentAction || "None"}
Current Topic: ${state.currentTopic || "Unknown"}
Pending Question from Agent: ${state.pendingQuestion || "None"}

INSTRUCTIONS:
${state.greetingAlreadyDone ? "- DO NOT greet the customer again (no 'Olá', 'Bom dia', etc)." : "- This is the start of the conversation, a polite greeting is expected."}
${state.pendingQuestion ? `- The customer might be answering your previous question: "${state.pendingQuestion}".` : ""}
- Ensure the response flows naturally from the last action: "${state.lastAgentAction || "First message"}".
`.trim();
}
