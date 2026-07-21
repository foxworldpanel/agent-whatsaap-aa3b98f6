import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";

export { DEFAULT_MODULES_V3 };

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
  objecoes_vendas: ["seguro", "bot", "garantia", "barato", "funciona mesmo", "confiar", "golpe"],
};

export function selectRelevantModules(text: string | null | undefined, enabledModules: string[]): string[] {
  const normalizedText = (text || "").toLowerCase();

  
  // Módulos Core que SEMPRE devem estar presentes
  const CORE_MODULES = new Set([
    "identidade",
    "regras_gerais",
    "comportamento_humano",
  ]);

  const selectedKeys = new Set<string>(CORE_MODULES);

  const hasCommercialIntent = ["comprar", "quero", "interesse", "ajuda", "serviço", "impulsionar", "divulgar", "seguidores", "curtidas", "views", "inscritos", "plays", "streams", "saves", "ouvintes"].some(kw => normalizedText.includes(kw));
  const isPriceRequested = ["quanto", "valor", "preço", "tabela", "custa", "lista"].some(kw => normalizedText.includes(kw));
  const isClosing = ["fechar", "quero esse", "vou querer", "blz", "ok", "manda o link", "pode mandar", "esse mesmo"].some(kw => normalizedText.includes(kw));
  const isSupport = ["problema", "erro", "pedido", "ajuda", "status", "atraso", "caiu", "ticket"].some(kw => normalizedText.includes(kw));
  const isObjection = KEYWORD_MAP.objecoes_vendas.some(kw => normalizedText.includes(kw));

  if (isSupport) {
    selectedKeys.add("suporte_pos_compra");
  } else {
    if (hasCommercialIntent) {
      selectedKeys.add("fluxo_vendas");
      selectedKeys.add("psicologia_vendas");
      selectedKeys.add("qualificacao_lead");
    }
    if (isPriceRequested) {
      selectedKeys.add("tabela_precos");
    }
    if (isClosing) {
      selectedKeys.add("fechamento_vendas");
    }
    if (isObjection) {
      selectedKeys.add("objecoes_vendas");
    }
  }

  for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
    if (["pagamentos", "tabela_precos", "suporte", "suporte_pos_compra", "como_usar_painel", "prova_social", "objecoes_vendas"].includes(moduleKey)) continue;
    if (keywords.some(kw => normalizedText.includes(kw))) {
      selectedKeys.add(moduleKey);
    }
  }

  // Filtragem estrita baseada em enabledModules e CORE_MODULES
  return Array.from(selectedKeys).filter(
    key => CORE_MODULES.has(key) || enabledModules.includes(key)
  );
}

export function buildPromptFromModules(
  keys: string[], 
  customModules: Record<string, string | { content: string; source: string; fallback_reason?: string }>
): string {
  return keys
    .map(key => {
      const mod = customModules[key];
      if (!mod) return "";
      if (typeof mod === "string") return mod;
      
      // Telemetria silenciosa no log se for fallback
      if (mod.source === "fallback") {
        console.log(`[V3-FALLBACK-TELEMETRY] Module: ${key}, Reason: ${mod.fallback_reason || "unknown"}`);
      }
      
      return mod.content;
    })
    .filter(Boolean)
    .join("\n\n");
}
