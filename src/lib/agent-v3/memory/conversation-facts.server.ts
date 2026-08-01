export type ConversationFactsV3 = {
  customerName: string | null;
  musicTitle: string | null;
  artistName: string | null;
  objective: string | null;
};

export const EMPTY_CONVERSATION_FACTS_V3: ConversationFactsV3 = {
  customerName: null,
  musicTitle: null,
  artistName: null,
  objective: null,
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

  return {
    customerName:
      firstMatch(text, [
        /\b(?:meu nome [ée]|me chamo)\s+([\p{L}][\p{L}\s'-]{1,60})/iu,
        /\bsou (?:o|a)\s+([\p{L}][\p{L}\s'-]{1,60})(?=\s*(?:,|\.|!|$))/iu,
      ]) || current.customerName,
    musicTitle:
      firstMatch(text, [
        /\b(?:minha|a) m[uú]sica (?:se chama|[ée])\s+["“]?([^"”\n]{1,100})/iu,
        /\bnome da m[uú]sica(?: [ée])?\s*[:\-]?\s*["“]?([^"”\n]{1,100})/iu,
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
  };
}

export function conversationFactsPromptV3(facts: ConversationFactsV3): string {
  return [
    facts.customerName ? `- Nome do cliente: ${facts.customerName}` : "",
    facts.musicTitle ? `- Música: ${facts.musicTitle}` : "",
    facts.artistName ? `- Artista: ${facts.artistName}` : "",
    facts.objective ? `- Objetivo declarado: ${facts.objective}` : "",
  ].filter(Boolean).join("\n");
}
