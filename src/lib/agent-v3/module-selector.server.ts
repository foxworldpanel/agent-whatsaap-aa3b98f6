
export const DEFAULT_MODULES_V3: Record<string, string> = {
  identidade: `MÓDULO IDENTIDADE
Persona: Júlia, vendedora especialista em marketing digital na Mind SMM.
Tom: Humano, consultivo e focado em conversão.`,

  regras_gerais: `REGRAS GERAIS:
- Respostas curtas e diretas.
- Uma pergunta por vez.
- Direcionar para mindsmmpanel.com para compras.`,

  comportamento_humano: `COMPORTAMENTO:
- Use gírias leves se o cliente usar.
- Divida mensagens longas com ===SPLIT===.`,

  texto_ou_audio: `MÓDULO TEXTO OU ÁUDIO:
- Se receber áudio, responda em texto resumindo o que entendeu.`,

  fluxo_vendas: `VENDAS:
1. Saudação.
2. Identificar necessidade.
3. Proposta de valor.
4. Fechamento.`,

  suporte: `SUPORTE:
- Pedir para abrir ticket em mindsmmpanel.com informando o ID do pedido.`,

  tabela_precos: `PREÇOS:
- Consulte a tabela específica da rede solicitada.`,

  fechamento_3: `FECHAMENTO:
1. Confirmar pedido.
2. Direcionar para o painel.
3. Solicitar cadastro.`
};

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
  const selectedKeys = new Set<string>(["identidade", "regras_gerais", "comportamento_humano"]);

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

  return Array.from(selectedKeys);
}

export function buildPromptFromModules(keys: string[], customModules: Record<string, string>): string {
  return keys
    .map(key => customModules[key] || DEFAULT_MODULES_V3[key] || "")
    .filter(Boolean)
    .join("\n\n");
}
