// src/lib/agent-v3/metadata-extractor.server.ts

export type AgentResponseV3 = {
  text: string;
  temperature: "frio" | "morno" | "quente";
  confidence: "Muito baixa" | "Baixa" | "Média" | "Alta" | "Muito alta";
  intent: "Saudação" | "Informação" | "Pesquisa" | "Comparação" | "Compra" | "Suporte" | "Pagamento" | "Pós-venda" | "Reclamação" | "Outro";
  stage: "Primeiro contato" | "Descoberta" | "Qualificação" | "Negociação" | "Objeções" | "Fechamento" | "Pós-venda";
  purchase_probability: number;
  sentiment: "Positivo" | "Neutro" | "Negativo";
  urgency: "Baixa" | "Média" | "Alta";
  recommended_action: string;
  reasoning: string;
};

export function extractMetadataV3(llmResponse: string): AgentResponseV3 {
  /**
   * Expected Lead Intelligence format from LLM:
   * [TEMP:frio|morno|quente]
   * [CONF:Muito baixa|Baixa|Média|Alta|Muito alta]
   * [INTENT:Saudação|Informação|...]
   * [STAGE:Primeiro contato|Descoberta|...]
   * [PROB:0-100]
   * [SENT:Positivo|Neutro|Negativo]
   * [URG:Baixa|Média|Alta]
   * [ACTION:Ação recomendada]
   * [REASON:Justificativa]
   */

  const tempMatch = llmResponse.match(/\[TEMP:(frio|morno|quente)\]/i);
  const confMatch = llmResponse.match(/\[CONF:([^\]]+)\]/i);
  const intentMatch = llmResponse.match(/\[INTENT:([^\]]+)\]/i);
  const stageMatch = llmResponse.match(/\[STAGE:([^\]]+)\]/i);
  const probMatch = llmResponse.match(/\[PROB:(\d+)\]/i);
  const sentMatch = llmResponse.match(/\[SENT:(Positivo|Neutro|Negativo)\]/i);
  const urgMatch = llmResponse.match(/\[URG:(Baixa|Média|Alta)\]/i);
  const actionMatch = llmResponse.match(/\[ACTION:([^\]]+)\]/i);
  const reasonMatch = llmResponse.match(/\[REASON:([^\]]+)\]/i);

  const temperature = (tempMatch?.[1]?.toLowerCase() as any) || "morno";
  const confidence = (confMatch?.[1] as any) || "Média";
  const intent = (intentMatch?.[1] as any) || "Informação";
  const stage = (stageMatch?.[1] as any) || "Descoberta";
  const purchase_probability = parseInt(probMatch?.[1] || "0", 10);
  const sentiment = (sentMatch?.[1] as any) || "Neutro";
  const urgency = (urgMatch?.[1] as any) || "Média";
  const recommended_action = actionMatch?.[1] || "";
  const reasoning = reasonMatch?.[1] || "";

  // Remove ALL markers from the text
  const cleanText = llmResponse
    .replace(/\[TEMP:[^\]]+\]/gi, "")
    .replace(/\[CONF:[^\]]+\]/gi, "")
    .replace(/\[INTENT:[^\]]+\]/gi, "")
    .replace(/\[STAGE:[^\]]+\]/gi, "")
    .replace(/\[PROB:[^\]]+\]/gi, "")
    .replace(/\[SENT:[^\]]+\]/gi, "")
    .replace(/\[URG:[^\]]+\]/gi, "")
    .replace(/\[ACTION:[^\]]+\]/gi, "")
    .replace(/\[REASON:[^\]]+\]/gi, "")
    .trim();

  return {
    text: cleanText,
    temperature,
    confidence,
    intent,
    stage,
    purchase_probability,
    sentiment,
    urgency,
    recommended_action,
    reasoning
  };
}

