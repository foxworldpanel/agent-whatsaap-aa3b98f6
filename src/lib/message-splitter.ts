/**
 * Auto-split de respostas do agente para envio no WhatsApp.
 *
 * O Claude já pode marcar splits explícitos com "===SPLIT===". Mas, quando
 * a resposta vem numa única bolha genuinamente longa (>350 chars) contendo
 * parágrafos separados por \n\n, precisamos quebrar em mensagens
 * independentes — do contrário sai uma bolha grande e o cliente se perde.
 *
 * Regras:
 * - Parte com <= LONG_MESSAGE_THRESHOLD chars: nunca divide, mesmo com \n\n.
 * - Parte > LONG_MESSAGE_THRESHOLD chars: divide nos \n\n (parágrafos).
 *   Se ainda houver pedaço acima do threshold sem \n\n, mantém como está
 *   (não fatiamos frases arbitrariamente).
 */
export const LONG_MESSAGE_THRESHOLD = 350;

export function autoSplitLongParts(
  parts: string[],
  threshold: number = LONG_MESSAGE_THRESHOLD,
): string[] {
  const out: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (part.length <= threshold || !/\n\s*\n/.test(part)) {
      out.push(part);
      continue;
    }
    const paragraphs = part
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length <= 1) {
      out.push(part);
      continue;
    }
    for (const p of paragraphs) out.push(p);
  }
  return out;
}