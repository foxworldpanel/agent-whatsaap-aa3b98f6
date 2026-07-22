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
  conversation_score: number;
  conversation_feedback: string[];
};

const TEMPERATURES = ["frio", "morno", "quente"] as const;
const CONFIDENCES = ["Muito baixa", "Baixa", "Média", "Alta", "Muito alta"] as const;
const INTENTS = ["Saudação", "Informação", "Pesquisa", "Comparação", "Compra", "Suporte", "Pagamento", "Pós-venda", "Reclamação", "Outro"] as const;
const STAGES = ["Primeiro contato", "Descoberta", "Qualificação", "Negociação", "Objeções", "Fechamento", "Pós-venda"] as const;
const SENTIMENTS = ["Positivo", "Neutro", "Negativo"] as const;
const URGENCIES = ["Baixa", "Média", "Alta"] as const;

function normalizeLabel<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  const normalized = value?.trim().toLocaleLowerCase("pt-BR");
  const match = allowed.find((item) => item.toLocaleLowerCase("pt-BR") === normalized);
  return (match ?? fallback) as T[number];
}

function boundedInteger(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export function extractMetadataV3(llmResponse: string): AgentResponseV3 {
  const source = String(llmResponse || "");
  const tempMatch = source.match(/\[TEMP:([^\]]+)\]/i);
  const confMatch = source.match(/\[CONF:([^\]]+)\]/i);
  const intentMatch = source.match(/\[INTENT:([^\]]+)\]/i);
  const stageMatch = source.match(/\[STAGE:([^\]]+)\]/i);
  const probMatch = source.match(/\[PROB:([+-]?\d+)\]/i);
  const sentMatch = source.match(/\[SENT:([^\]]+)\]/i);
  const urgMatch = source.match(/\[URG:([^\]]+)\]/i);
  const actionMatch = source.match(/\[ACTION:([^\]]+)\]/i);
  const reasonMatch = source.match(/\[REASON:([^\]]+)\]/i);
  const scoreMatch = source.match(/\[SCORE:([+-]?\d+)\]/i);
  const feedbackMatch = source.match(/\[FEEDBACK:([^\]]+)\]/i);

  const cleanText = source
    .replace(/\[(?:TEMP|CONF|INTENT|STAGE|PROB|SENT|URG|ACTION|REASON|SCORE|FEEDBACK):[^\]]*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: cleanText,
    temperature: normalizeLabel(tempMatch?.[1], TEMPERATURES, "morno"),
    confidence: normalizeLabel(confMatch?.[1], CONFIDENCES, "Média"),
    intent: normalizeLabel(intentMatch?.[1], INTENTS, "Informação"),
    stage: normalizeLabel(stageMatch?.[1], STAGES, "Descoberta"),
    purchase_probability: boundedInteger(probMatch?.[1]),
    sentiment: normalizeLabel(sentMatch?.[1], SENTIMENTS, "Neutro"),
    urgency: normalizeLabel(urgMatch?.[1], URGENCIES, "Média"),
    recommended_action: actionMatch?.[1]?.trim() || "",
    reasoning: reasonMatch?.[1]?.trim() || "",
    conversation_score: boundedInteger(scoreMatch?.[1]),
    conversation_feedback: (feedbackMatch?.[1] || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
