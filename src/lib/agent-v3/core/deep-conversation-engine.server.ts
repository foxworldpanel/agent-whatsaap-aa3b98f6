// src/lib/agent-v3/core/deep-conversation-engine.server.ts
import { ChatMessageV3 } from "../memory/conversation-state.server";
import { callAnthropicV3, extractAnthropicTextV3 } from "../integrations/llm-client.server";

export interface ConversationSummaryV3 {
  knownFacts: string[];
  customerObjectives: string[];
  answeredInformation: string[];
  answeredQuestions: string[];
  pendingQuestions: string[];
  customerProfile: "ARTISTA PROFISSIONAL" | "OUTRO";
}

/**
 * Deep Conversation Engine V1 - Conversation Understanding
 */
export async function understandConversation(params: {
  message: string;
  history: ChatMessageV3[];
}): Promise<ConversationSummaryV3> {
  const { message, history } = params;

  // Detecção de Perfil (Heurística Determinística)
  const professionalKeywords = [
    "onerpm", "cd baby", "distrokid", "album", "lançamento", 
    "distribuidora", "músicas próprias", "spotify for artists"
  ];
  const normalizedMsg = message.toLowerCase();
  const isProfessional = professionalKeywords.some(kw => normalizedMsg.includes(kw));

  const prompt = `
Analise a conversa abaixo e gere um resumo estruturado para o agente de IA.

[MENSAGEM ATUAL]
${message}

[HISTÓRICO]
${history.map(m => `${m.role}: ${m.content}`).join("\n")}

Responda EXATAMENTE no formato JSON:
{
  "knownFacts": ["fato 1", "fato 2"],
  "customerObjectives": ["objetivo 1"],
  "answeredInformation": ["informação que o agente já passou"],
  "answeredQuestions": ["pergunta que o cliente já respondeu"],
  "pendingQuestions": ["pergunta que o agente ainda precisa fazer"],
  "customerProfile": "${isProfessional ? "ARTISTA PROFISSIONAL" : "OUTRO"}"
}
  `.trim();

  try {
    const raw = await callAnthropicV3([
      { role: "user", content: prompt }
    ], {
      system: "Você é um motor de análise de conversas. Extraia fatos e objetivos com precisão. Responda apenas JSON.",
      max_tokens: 1000,
      temperature: 0
    });
    
    const text = extractAnthropicTextV3(raw);
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || "{}";
    const data = JSON.parse(jsonStr);

    return {
      knownFacts: Array.isArray(data.knownFacts) ? data.knownFacts : [],
      customerObjectives: Array.isArray(data.customerObjectives) ? data.customerObjectives : [],
      answeredInformation: Array.isArray(data.answeredInformation) ? data.answeredInformation : [],
      answeredQuestions: Array.isArray(data.answeredQuestions) ? data.answeredQuestions : [],
      pendingQuestions: Array.isArray(data.pendingQuestions) ? data.pendingQuestions : [],
      customerProfile: isProfessional ? "ARTISTA PROFISSIONAL" : (data.customerProfile === "ARTISTA PROFISSIONAL" ? "ARTISTA PROFISSIONAL" : "OUTRO")
    };
  } catch (error) {
    console.error("[V3-DEEP-ENGINE] Error understanding conversation:", error);
    return {
      knownFacts: [],
      customerObjectives: [],
      answeredInformation: [],
      answeredQuestions: [],
      pendingQuestions: [],
      customerProfile: isProfessional ? "ARTISTA PROFISSIONAL" : "OUTRO"
    };
  }
}

export function summaryToPrompt(summary: ConversationSummaryV3): string {
  return `
[CONVERSATION UNDERSTANDING]
- Perfil do Cliente: ${summary.customerProfile}
- Fatos Conhecidos: ${summary.knownFacts.join("; ") || "Nenhum"}
- Objetivos: ${summary.customerObjectives.join("; ") || "Não declarados"}
- Já Respondido pelo Cliente: ${summary.answeredQuestions.join("; ") || "Nada"}
- Informações já dadas pelo Agente: ${summary.answeredInformation.join("; ") || "Nenhuma"}
- Perguntas Pendentes (Não repetir o que já foi respondido): ${summary.pendingQuestions.join("; ") || "Nenhuma"}

REGRA CRÍTICA: É proibido perguntar novamente qualquer informação já fornecida pelo cliente listada acima.
${summary.customerProfile === "ARTISTA PROFISSIONAL" ? "COMPORTAMENTO: Adapte para ARTISTA PROFISSIONAL - tom mais sério, focado em carreira e distribuição real." : ""}
  `.trim();
}
