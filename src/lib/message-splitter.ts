/**
 * Auto-split de respostas do agente para envio no WhatsApp.
 */
export const LONG_MESSAGE_THRESHOLD = 350;

export function isMeaningfulPart(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

export function autoSplitLongParts(
  parts: string[],
  _threshold: number = LONG_MESSAGE_THRESHOLD,
): string[] {
  const out: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!isMeaningfulPart(part)) continue;
    
    // Verificando se contém \n\n
    if (!/\n\s*\n/.test(part)) {
      out.push(part);
      continue;
    }
    
    const paragraphs = part
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => isMeaningfulPart(p));
      
    if (paragraphs.length <= 1) {
      out.push(part);
      continue;
    }
    for (const p of paragraphs) out.push(p);
  }
  return out;
}
