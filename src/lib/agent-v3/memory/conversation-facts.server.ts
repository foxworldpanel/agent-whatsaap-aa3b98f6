export type ConversationFactsV3 = {
  customerName: string | null;
  musicTitle: string | null;
  artistName: string | null;
  objective: string | null;
  lastTopic: string | null;
  salesIntent: "low" | "medium" | "high" | null;
  budgetMentioned: number | null;
  objectionType: "trust" | "price" | "time" | "none" | null;
};

export const EMPTY_CONVERSATION_FACTS_V3: ConversationFactsV3 = {
  customerName: null,
  musicTitle: null,
  artistName: null,
  objective: null,
  lastTopic: null,
  salesIntent: null,
  budgetMentioned: null,
  objectionType: null,
};

function cleanFact(value: string | undefined): string | null {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "")
    .trim();
  return cleaned ? cleaned.slice(0, 160) : null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanFact(match?.[1]);
    if (value) return value;
  }
  return null;
}

export function extractConversationFactsV3(
  message: string,
  current: ConversationFactsV3 = EMPTY_CONVERSATION_FACTS_V3,
): ConversationFactsV3 {
  const text = String(message || "").trim();
  if (!text) return { ...current };

  const normalized = text.toLowerCase();

  // Detecção de Intenção de Venda (Simples)
  let salesIntent = current.salesIntent;
  if (/\b(quero fechar|como pago|manda o pix|vou querer|comprar agora)\b/i.test(normalized)) {
    salesIntent = "high";
  } else if (/\b(quanto custa|valor|preco|como funciona|tem teste)\b/i.test(normalized)) {
    salesIntent = "medium";
  }

  // Objeção
  let objectionType = current.objectionType;
  if (/\b(seguro|confiavel|golpe|medo)\b/i.test(normalized)) {
    objectionType = "trust";
  } else if (/\b(caro|abaixa|desconto|dinheiro)\b/i.test(normalized)) {
    objectionType = "price";
  } else if (/\b(demora|prazo|quando chega)\b/i.test(normalized)) {
    objectionType = "time";
  }

  // Budget
  const budgetMatch = text.match(/R\$\s*([\d.]+(?:,\d+)?)/i);
  const budgetMentioned = budgetMatch 
    ? Number(budgetMatch[1].replace(/\./g, "").replace(",", ".")) 
    : current.budgetMentioned;

  return {
    customerName:
      firstMatch(text, [
        /\b(?:meu nome [ée]|me chamo)\s+([\p{L}][\p{L}\s'-]{1,60})/iu,
        /\bsou (?:o|a)\s+([\p{L}][\p{L}\s'-]{1,60})(?=\s*(?:,|\.|!|$))/iu,
      ]) || current.customerName,
    musicTitle:
      firstMatch(text, [
        /\b(?:minha|a) m[uú]sica (?:se chama|[ée])\s+["“]?([^"\"n]{1,100})/iu,
        /\bnome da m[uú]sica(?: [ée])?\s*[:\-]?\s*["“]?([^"\"n]{1,100})/iu,
      ]) || current.musicTitle,
    artistName:
      firstMatch(text, [
        /\b(?:meu )?nome art[ií]stico(?: [ée])?\s*[:\-]?\s*([^,\n.!?]{1,80})/iu,
        /\b(?:o )?artista(?: [ée]| se chama)\s+([^,\n.!?]{1,80})/iu,
      ]) || current.artistName,
    objective:
      firstMatch(text, [
        /\b(?:meu objetivo [ée]|quero|preciso)\s+([^.!?\n]{3,140})/iu,
        /\b(?:objetivo|meta)\s*[:\-]\s*([^.!?\n]{3,140})/iu,
      ]) || current.objective,
    lastTopic: current.lastTopic, // Será atualizado externamente se necessário
    salesIntent,
    budgetMentioned,
    objectionType,
  };
}

export function normalizeConversationFactsV3(value: unknown): ConversationFactsV3 {
  const source = value && typeof value === "object"
    ? value as Partial<ConversationFactsV3>
    : {};
  return {
    customerName: cleanFact(source.customerName || undefined),
    musicTitle: cleanFact(source.musicTitle || undefined),
    artistName: cleanFact(source.artistName || undefined),
    objective: cleanFact(source.objective || undefined),
    lastTopic: cleanFact(source.lastTopic || undefined),
    salesIntent: source.salesIntent || null,
    budgetMentioned: source.budgetMentioned || null,
    objectionType: source.objectionType || null,
  };
}

export function conversationFactsPromptV3(facts: ConversationFactsV3): string {
  const lines = [
    facts.customerName ? `- Nome do cliente: ${facts.customerName}` : "",
    facts.musicTitle ? `- Música: ${facts.musicTitle}` : "",
    facts.artistName ? `- Artista: ${facts.artistName}` : "",
    facts.objective ? `- Objetivo declarado: ${facts.objective}` : "",
    facts.salesIntent ? `- Intenção de compra: ${facts.salesIntent}` : "",
    facts.budgetMentioned ? `- Orçamento mencionado: R$ ${facts.budgetMentioned}` : "",
    facts.objectionType && facts.objectionType !== "none" ? `- Objeção atual: ${facts.objectionType}` : "",
  ].filter(Boolean);

  if (lines.length === 0) return "";
  return "\nFATOS DETERMINÍSTICOS (MEMÓRIA DE CURTO PRAZO):\n" + lines.join("\n");
}
