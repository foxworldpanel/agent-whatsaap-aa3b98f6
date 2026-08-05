/**
 * Remove acentos de um texto (NFD + remove marcas diacríticas).
 * Extraído porque a mesma lógica de 2 linhas se repetia dentro de 4
 * funções de normalização diferentes (module-selector, ai.server,
 * uazapi-webhook). Só a remoção de acento é compartilhada — cada
 * função continua com seu próprio comportamento além disso (uma
 * remove pontuação, outra não, etc.), então não foram unificadas.
 */
export function removeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
