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
};

export function selectRelevantModules(text: string, enabledModules: string[]): string[] {
  const normalizedText = text.toLowerCase();
  
  // Módulos Core que SEMPRE devem estar presentes
  const CORE_MODULES = new Set([
    "identidade",
    "regras_gerais",
    "comportamento_humano",
  ]);

  const selectedKeys = new Set<string>(CORE_MODULES);

  const hasCommercialIntent = ["comprar", "quero", "interesse", "ajuda", "serviço", "impulsionar", "divulgar", "seguidores", "curtidas", "views", "inscritos", "plays", "ouvintes"].some(kw => normalizedText.includes(kw));
  const isPriceRequested = ["quanto", "valor", "preço", "tabela", "custa", "lista"].some(kw => normalizedText.includes(kw));
  const isClosing = ["fechar", "quero esse", "vou querer", "blz", "ok", "manda o link"].some(kw => normalizedText.includes(kw));
  const isSupport = ["problema", "erro", "pedido", "ajuda", "status", "atraso", "caiu", "ticket"].some(kw => normalizedText.includes(kw));

  if (isSupport) {
    selectedKeys.add("suporte");
  } else {
    if (hasCommercialIntent) {
      selectedKeys.add("fluxo_vendas");
    }
    if (isPriceRequested) {
      selectedKeys.add("tabela_precos");
    }
    if (isClosing) {
      selectedKeys.add("fechamento_3");
    }
  }

  for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
    if (["pagamentos", "tabela_precos", "suporte", "como_usar_painel", "prova_social"].includes(moduleKey)) continue;
    if (keywords.some(kw => normalizedText.includes(kw))) {
      selectedKeys.add(moduleKey);
    }
  }

  // Filtragem estrita baseada em enabledModules e CORE_MODULES
  const allowedKeys = Array.from(selectedKeys).filter(
    key => CORE_MODULES.has(key) || enabledModules.includes(key)
  );

  return allowedKeys;
}

export function buildPromptFromModules(keys: string[], customModules: Record<string, string>): string {
  return keys
    .map(key => customModules[key] || DEFAULT_MODULES_V3[key] || "")
    .filter(Boolean)
    .join("\n\n");
}
