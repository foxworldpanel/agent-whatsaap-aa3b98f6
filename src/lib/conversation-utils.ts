export function humanizePunctuation(text: string): string {
  if (!text) return "";
  // Remove en-dash (–) e em-dash (—) típicos de LLM e substitui por hífen simples ou vírgula
  return text
    .replace(/ — /g, ", ")
    .replace(/ —/g, ",")
    .replace(/— /g, ", ")
    .replace(/—/g, ",")
    .replace(/ – /g, " - ")
    .replace(/ –/g, " -")
    .replace(/– /g, " - ")
    .replace(/–/g, "-");
}
