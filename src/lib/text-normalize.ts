/**
 * Normalização determinística e resiliente para gatilhos e mensagens.
 * Remove acentos, pontuação, emojis, espaços extras e converte para lowercase.
 */
export function normalizeTriggerText(value: string): string {
  if (!value) return "";
  
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/gi, "") // Remove pontuação e caracteres especiais (incluindo emojis básicos)
    .replace(/\s+/g, " ") // Colapsa espaços múltiplos
    .trim();
}

/**
 * Legado: Mantido por compatibilidade de importação, mas agora usa a lógica unificada.
 */
export function removeAccents(value: string): string {
  if (!value) return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

