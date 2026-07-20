import { DEFAULT_MODULES } from "@/lib/agent-modules";

export const KEYWORD_MAP: Record<string, string[]> = {
  spotify: ["spotify", "playlist", "ouvintes", "streams", "save", "plays"],
  instagram: ["instagram", "insta", "ig ", "seguidores ig", "reels", "curtidas instagram"],
  youtube: ["youtube", "yt ", "inscritos", "views", "likes", "horas"],
  tiktok: ["tiktok", "tik tok", "views", "seguidores"],
  kwai: ["kwai"],
  facebook: ["facebook", "face "],
  x_twitter: ["twitter", "x "],
  pagamentos: ["pix", "pagar", "pagamento", "comprovante", "valor", "preço", "quanto", "custa", "saldo", "recarga"],
  suporte: ["suporte", "ticket", "ajuda", "problema", "erro", "pedido", "status", "não chegou", "atraso"],
  teste_gratis: ["teste", "gratis", "amostra", "confiável", "golpe", "funciona"],
  como_usar_painel: ["como usar", "cadastro", "entrar", "site", "link", "painel", "conta"],
};

export function selectRelevantModules(text: string, enabledModules: string[]): string[] {
  console.log("[v3-module-selector] Input text:", text);
  console.log("[v3-module-selector] Received enabledModules:", enabledModules);
  
  const normalizedText = text.toLowerCase();
  const selectedKeys = new Set<string>(["identidade", "regras_gerais", "comportamento_humano"]); // Always include base modules

  // Core business logic: search for keywords
  for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
    // Only check if module is enabled in the config
    const isEnabled = enabledModules.includes(moduleKey);
    if (isEnabled) {
      if (keywords.some(kw => normalizedText.includes(kw))) {
        console.log(`[v3-module-selector] Module '${moduleKey}' SELECTED via keyword match.`);
        selectedKeys.add(moduleKey);
      }
    } else {
      // Log modules that are NOT enabled but have matching keywords to help debug
      if (keywords.some(kw => normalizedText.includes(kw))) {
        console.log(`[v3-module-selector] Module '${moduleKey}' matched keywords but is NOT in enabledModules list.`);
      }
    }
  }

  // If after keyword search we still only have base modules, maybe it's a generic sales talk
  if (selectedKeys.size <= 3) {
    console.log("[v3-module-selector] No specific module selected, adding default sales modules.");
    selectedKeys.add("fluxo_vendas");
    selectedKeys.add("tecnicas_vendas");
  }

  const result = Array.from(selectedKeys);
  console.log("[v3-module-selector] Final selected modules:", result);
  return result;
}

/**
 * Builds the prompt string from the selected module keys.
 * Prioritizes modules from the database (customModules) if available,
 * otherwise falls back to the local DEFAULT_MODULES (hardcoded V1 content).
 */
export function buildPromptFromModules(keys: string[], customModules: Record<string, string>): string {
  return keys
    .map(key => {
      // Use DB version if exists, otherwise fallback to local hardcoded V1 content
      return customModules[key] || DEFAULT_MODULES[key] || "";
    })
    .filter(Boolean)
    .join("\n\n");
}
