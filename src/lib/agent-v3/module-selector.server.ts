import { DEFAULT_MODULES } from "@/lib/agent-modules";

export const KEYWORD_MAP: Record<string, string[]> = {
  spotify: ["spotify", "playlist", "ouvintes", "streams", "save", "plays"],
  instagram: ["instagram", "insta", "ig ", "seguidores ig", "reels", "curtidas instagram", "story", "stories"],
  youtube: ["youtube", "yt ", "inscritos", "views", "likes", "horas", "visualização youtube"],
  tiktok: ["tiktok", "tik tok", "views tiktok", "seguidores tiktok"],
  kwai: ["kwai"],
  facebook: ["facebook", "face "],
  x_twitter: ["twitter", "x "],
  pagamentos: ["pix", "pagar", "pagamento", "comprovante", "valor", "preço", "quanto", "custa", "saldo", "recarga"],
  tabela_precos: ["tabela", "preços", "lista", "valores", "quanto é", "qual o valor"],
  suporte: ["suporte", "ticket", "ajuda", "problema", "erro", "pedido", "status", "não chegou", "atraso", "caiu"],
  teste_gratis: ["teste", "gratis", "amostra", "confiável", "golpe", "funciona", "testar"],
  como_usar_painel: ["como usar", "cadastro", "entrar", "site", "link", "painel", "conta", "cadastrar"],
  prova_social: ["confiança", "seguro", "alguém já comprou", "funciona mesmo", "prova", "print", "depoimento"],
};

export function selectRelevantModules(text: string, enabledModules: string[]): string[] {
  console.log("[v3-module-selector] Input text:", text);
  
  const normalizedText = text.toLowerCase();
  
  // FASE 3: Progressive Module Loading Logic
  const selectedKeys = new Set<string>(["identidade"]); // Basic Persona always present

  // 1. Basic behavior / rules
  selectedKeys.add("regras_gerais");
  selectedKeys.add("comportamento_humano");

  // 2. Intent Detection
  const hasCommercialIntent = ["comprar", "quero", "interesse", "ajuda", "serviço", "impulsionar", "divulgar", "seguidores", "curtidas", "views", "inscritos", "plays", "ouvintes"].some(kw => normalizedText.includes(kw));
  const isPriceRequested = ["quanto", "valor", "preço", "tabela", "custa", "lista"].some(kw => normalizedText.includes(kw));
  const isClosing = ["fechar", "quero esse", "vou querer", "blz", "ok", "manda o link"].some(kw => normalizedText.includes(kw));
  const isSupport = ["problema", "erro", "pedido", "ajuda", "status", "atraso", "caiu", "ticket"].some(kw => normalizedText.includes(kw));

  // 3. Audio/Image detection (handled by orchestrator injection usually, but we ensure here)
  if (normalizedText.includes("[audio]") || normalizedText.includes("[transcrição]")) {
    selectedKeys.add("texto_ou_audio");
  }

  // 4. Conditional Loading Rules (Phase 3)
  if (isSupport) {
    selectedKeys.add("suporte");
    // Rule: Don't load sales modules if it's support
  } else {
    // Only load sales modules if NOT support
    if (hasCommercialIntent) {
      selectedKeys.add("fluxo_vendas");
      selectedKeys.add("tecnicas_vendas");
    }

    if (isPriceRequested) {
      selectedKeys.add("tabela_precos");
      selectedKeys.add("calculo_preco");
    }

    if (isClosing) {
      selectedKeys.add("fechamento_3");
    }
  }

  // 5. Network specific modules (Add ONLY detected networks from KEYWORD_MAP)
  for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
    // Skip general utility modules that are handled separately
    if (["pagamentos", "tabela_precos", "suporte", "como_usar_painel", "prova_social", "calculo_preco"].includes(moduleKey)) continue;

    if (keywords.some(kw => normalizedText.includes(kw))) {
      console.log(`[v3-module-selector] Network Module '${moduleKey}' SELECTED.`);
      selectedKeys.add(moduleKey);
    }
  }

  // Global utilities if relevant
  if (normalizedText.includes("link") || normalizedText.includes("site") || normalizedText.includes("painel")) {
    selectedKeys.add("como_usar_painel");
  }
  
  if (normalizedText.includes("pagar") || normalizedText.includes("pix") || normalizedText.includes("pagamento")) {
    selectedKeys.add("pagamentos");
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
