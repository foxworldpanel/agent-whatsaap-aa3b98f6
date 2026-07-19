// src/lib/agent-v3/metadata-extractor.server.ts

export type AgentResponseV3 = {
  text: string;
  temperature: "frio" | "morno" | "quente";
  intent: string;
  stage: string;
};

export function extractMetadataV3(llmResponse: string): AgentResponseV3 {
  // Expected format from LLM:
  // [TEMP:quente]
  // [INTENT:compra]
  // [STAGE:fechamento]
  // Message text here...

  const tempMatch = llmResponse.match(/\[TEMP:(frio|morno|quente)\]/i);
  const intentMatch = llmResponse.match(/\[INTENT:([^\]]+)\]/i);
  const stageMatch = llmResponse.match(/\[STAGE:([^\]]+)\]/i);

  const temperature = (tempMatch?.[1]?.toLowerCase() as "frio" | "morno" | "quente") || "morno";
  const intent = intentMatch?.[1] || "desconhecida";
  const stage = stageMatch?.[1] || "indefinido";

  // Remove markers from the text
  const cleanText = llmResponse
    .replace(/\[TEMP:[^\]]+\]/gi, "")
    .replace(/\[INTENT:[^\]]+\]/gi, "")
    .replace(/\[STAGE:[^\]]+\]/gi, "")
    .trim();

  return {
    text: cleanText,
    temperature,
    intent,
    stage
  };
}
