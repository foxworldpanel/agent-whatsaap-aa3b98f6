// Trava DETERMINÍSTICA de frequência de emoji nas respostas do agente.
// Motivação: mesmo com regra_emoji no prompt, o modelo insiste em fechar
// mensagens com "😊" / "👍", gerando 2+ mensagens seguidas com emoji.
// Esta função roda no código (não depende do modelo lembrar) e aplica:
//   - se QUALQUER uma das últimas N respostas do agente já continha emoji,
//     remove TODOS os emojis da resposta atual (mantém o texto);
//   - caso contrário, permite no máximo 1 emoji na resposta (remove extras);
//   - preserva o marcador de split "===SPLIT===" e o texto em volta.
//
// Exceção: a mensagem de ABERTURA de disparo não passa por aqui — ela é
// enviada pelo blast dispatcher, não pelo fluxo de resposta do webhook.

// Regex que casa emojis (Extended_Pictographic) incluindo sequências ZWJ
// e variation selectors. Cobre a grande maioria dos emojis usados no WA.
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

export function containsEmoji(text: string): boolean {
  if (!text) return false;
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(text);
}

export function countEmojis(text: string): number {
  if (!text) return 0;
  return (text.match(EMOJI_RE) ?? []).length;
}

export function stripEmojis(text: string): string {
  if (!text) return text;
  // Remove emoji + espaço adjacente (evita "olá  !" com espaço duplo).
  return text
    .replace(new RegExp(`\\s*${EMOJI_RE.source}\\s*`, "gu"), " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?;:…])/g, "$1")
    .replace(/ +\n/g, "\n")
    .trim();
}

// Mantém apenas o primeiro emoji e remove os demais.
export function keepFirstEmojiOnly(text: string): string {
  if (!text) return text;
  let seen = false;
  const out = text.replace(EMOJI_RE, (m) => {
    if (!seen) {
      seen = true;
      return m;
    }
    return "";
  });
  return out.replace(/[ \t]{2,}/g, " ").replace(/ ([.,!?;:…])/g, "$1").trim();
}

export interface LimitEmojiOptions {
  // Últimas mensagens do agente nessa conversa (mais recente por último ou
 // por primeiro, não importa — só olhamos se alguma contém emoji).
  recentAgentBodies: string[];
  // Quantas mensagens do agente considerar como "recentes". Default: 3.
  window?: number;
  // Quando true, ignora a trava (ex.: abertura de disparo com padrão próprio).
  isBlastOpening?: boolean;
}

export function limitEmojiFrequency(reply: string, opts: LimitEmojiOptions): string {
  if (!reply) return reply;
  if (opts.isBlastOpening) return reply;
  if (!containsEmoji(reply)) return reply;

  const windowSize = opts.window ?? 3;
  const recent = (opts.recentAgentBodies ?? []).slice(-windowSize);
  const anyRecentHadEmoji = recent.some((b) => containsEmoji(b));

  // Aplica bolha por bolha para preservar o marcador ===SPLIT===.
  const parts = reply.split(/===SPLIT===/);
  const cleaned = parts.map((part) => {
    if (anyRecentHadEmoji) return stripEmojis(part);
    if (countEmojis(part) > 1) return keepFirstEmojiOnly(part);
    return part;
  });
  return cleaned.join("===SPLIT===");
}