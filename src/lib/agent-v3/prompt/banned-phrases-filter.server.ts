// Remove, de forma determinística (sem depender da IA lembrar da regra),
// as frases de despedida genéricas que já foram banidas no prompt há
// muito tempo mas continuam aparecendo. Confirmado em 3 conversas reais
// diferentes no mesmo dia (13/08/2026) — reforço de prompt sozinho não
// está segurando essa regra específica, por isso a trava de código.
//
// Puramente aditivo/defensivo: se a remoção deixasse a mensagem vazia ou
// quase vazia, mantém o texto original — nunca gera mensagem vazia por
// causa desse filtro.

const BANNED_CLOSING_PATTERNS: RegExp[] = [
  // "qualquer dúvida... é só chamar" (com ou sem coisa no meio)
  /[.,!]?\s*qualquer\s+d[uú]vida[^.!?]{0,60}?[ée]\s+s[oó]\s+cham[ae][rm]?[^.!?]*[.!?]?/gi,
  // "é só chamar que a gente..."
  /[.,!]?\s*[ée]\s+s[oó]\s+(?:me\s+)?cham[ae][rm]?\s+que\s+a\s+gente[^.!?]*[.!?]?/gi,
  // "boa sorte" (com emoji comum depois, se tiver)
  /[.,!]?\s*boa\s+sorte\b[^.!?]*[.!?]?\s*(?:🎵|🚀|😊)?/gi,
  // "fico por aqui"
  /[.,!]?\s*fico\s+por\s+aqui\b[^.!?]*[.!?]?/gi,
  // "sucesso na compra" / "sucesso aí"
  /[.,!]?\s*sucesso\s+(?:na\s+compra|a[íi])\b[^.!?]*[.!?]?/gi,
];

export function removeBannedClosingPhrasesV3(text: string): string {
  let result = text;
  for (const pattern of BANNED_CLOSING_PATTERNS) {
    result = result.replace(pattern, "");
  }
  result = result.trim();

  // Proteção: nunca deixa a mensagem vazia por causa desse filtro — se
  // sobrou pouco ou nada, mantém o texto original sem mexer.
  if (result.length < 3) return text.trim();
  return result;
}
