/**
 * Auto-split de respostas do agente para envio no WhatsApp.
 *
 * O Claude já pode marcar splits explícitos com "===SPLIT===". Além disso,
 * qualquer parte que contenha \n\n é dividida em mensagens independentes —
 * se o modelo separou parágrafos, são ideias distintas e devem virar bolhas
 * separadas no WhatsApp, independente do tamanho total.
 *
 * Regras:
 * - Parte sem \n\n: mantém como está (não fatiamos frases arbitrariamente).
 * - Parte com \n\n: divide em parágrafos, cada um vira uma mensagem.
 *
 * A regra de NÃO gerar \n\n desnecessariamente em respostas curtas de 1
 * ideia só é responsabilidade do prompt/identidade do agente, não deste
 * splitter — aqui só respeitamos o sinal que o modelo já emitiu.
 */
export const LONG_MESSAGE_THRESHOLD = 350;

/**
 * Retorna true se a parte tem conteúdo substantivo (não é vazia nem só
 * reticências / pontuação isolada). Usado para descartar "bolhas fantasmas"
 * que às vezes vêm do modelo ou de resíduos de split.
 *
 * Exemplos que retornam false: "", "   ", "...", "…", "... ...", ".", "!!!",
 * "— —", ",,,". Qualquer parte com pelo menos uma letra ou dígito é mantida.
 */
export function isMeaningfulPart(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Precisa ter ao menos uma letra (inclui acentos) ou dígito.
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