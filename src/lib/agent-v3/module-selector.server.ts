import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";

export { DEFAULT_MODULES_V3 };

export type ConversationContext = {
  intent:
    | "saudacao"
    | "descoberta"
    | "consulta_preco"
    | "compra"
    | "duvida_seguranca"
    | "pagamento"
    | "suporte"
    | "pos_compra"
    | "recuperacao"
    | "encerramento"
    | "desconhecido";
  stage:
    | "inicio"
    | "qualificacao"
    | "apresentacao"
    | "negociacao"
    | "fechamento"
    | "pos_venda"
    | "suporte";
  platform:
    | "instagram"
    | "youtube"
    | "spotify"
    | "tiktok"
    | "kwai"
    | "facebook"
    | "outra"
    | null;
  product:
    | "seguidores"
    | "curtidas"
    | "visualizacoes"
    | "inscritos"
    | "plays"
    | "ouvintes"
    | "playlist"
    | "live"
    | "horas"
    | "comentarios"
    | null;
  hasQuantity: boolean;
  hasPriceQuestion: boolean;
  hasPaymentSignal: boolean;
  hasSupportSignal: boolean;
  hasPurchaseSignal: boolean;
  confidence: number;
};

export type SelectionResultV3 = {
  context: ConversationContext;
  selectedModules: string[];
  selectionReasons: Record<string, string>;
};

export const KEYWORD_MAP: Record<string, string[]> = {
  spotify: ["spotify", "playlist", "ouvintes", "streams", "save", "plays", "podcast"],
  instagram: ["instagram", "insta", "ig ", "seguidores ig", "reels", "curtidas instagram", "story", "stories"],
  youtube: ["youtube", "yt ", "inscritos", "views", "likes", "horas", "visualização youtube", "canal"],
  tiktok: ["tiktok", "tik tok", "views tiktok", "seguidores tiktok"],
  kwai: ["kwai"],
  facebook: ["facebook", "face "],
  x_twitter: ["twitter", "x "],
  pagamentos: ["pix", "pagar", "pagamento", "comprovante", "valor", "preço", "quanto", "custa", "saldo", "recarga", "paguei", "fiz o pix"],
  tabela_precos: ["tabela", "preços", "lista", "valores", "quanto é", "qual o valor"],
  suporte: ["suporte", "ticket", "ajuda", "problema", "erro", "pedido", "status", "não chegou", "atraso", "caiu", "recarga não caiu", "sumiu"],
  seguranca: ["teste", "gratis", "amostra", "confiável", "golpe", "funciona", "testar", "seguro", "cair", "senha", "banimento", "risco"],
  como_usar_painel: ["como usar", "cadastro", "entrar", "site", "link", "painel", "conta", "cadastrar"],
  prova_social: ["confiança", "seguro", "alguém já comprou", "funciona mesmo", "prova", "print", "depoimento"],
  objecoes_vendas: ["bot", "garantia", "barato", "funciona mesmo", "confiar", "golpe"],
  fechamento: ["vou querer", "pode fazer", "manda o link", "vou levar", "ok", "blz", "fechar", "quero comprar"],
};

/**
 * Detecção de contexto baseada em mensagem atual e histórico recente
 */
export function detectConversationContext(
  text: string,
  history: Array<{ role: "agent" | "customer"; content: string }> = []
): ConversationContext {
  const normalizedText = text.toLowerCase();
  const fullHistoryText = history.map(h => h.content.toLowerCase()).join(" ");
  const recentCustomerMessages = history.filter(h => h.role === "customer").map(h => h.content.toLowerCase());
  const lastCustomerText = recentCustomerMessages[recentCustomerMessages.length - 1] || "";
  
  // 1. Detectar Plataforma
  let platform: ConversationContext["platform"] = null;
  const platforms = ["instagram", "youtube", "spotify", "tiktok", "kwai", "facebook", "twitter"];
  for (const p of platforms) {
    if (normalizedText.includes(p) || (history.length > 0 && fullHistoryText.includes(p))) {
      platform = (p === "twitter" ? "outra" : p) as any;
      if (normalizedText.includes(p)) break; // Mensagem atual tem prioridade
    }
  }

  // 2. Detectar Produto
  let product: ConversationContext["product"] = null;
  const products = ["seguidores", "curtidas", "visualizacoes", "inscritos", "plays", "ouvintes", "playlist", "live", "horas", "comentarios"];
  for (const pr of products) {
    if (normalizedText.includes(pr) || (history.length > 0 && fullHistoryText.includes(pr))) {
      product = pr as any;
      if (normalizedText.includes(pr)) break;
    }
  }

  // 3. Sinais
  const hasQuantity = /\d+/.test(normalizedText) || /\d+/.test(lastCustomerText);
  const hasPriceQuestion = KEYWORD_MAP.tabela_precos.some(kw => normalizedText.includes(kw));
  const hasPaymentSignal = KEYWORD_MAP.pagamentos.some(kw => normalizedText.includes(kw)) || normalizedText.includes("comprovante");
  const hasSupportSignal = KEYWORD_MAP.suporte.some(kw => normalizedText.includes(kw));
  const hasPurchaseSignal = KEYWORD_MAP.fechamento.some(kw => normalizedText.includes(kw)) || normalizedText.includes("comprar") || normalizedText.includes("quero");

  // 4. Intent & Stage
  let intent: ConversationContext["intent"] = "desconhecido";
  let stage: ConversationContext["stage"] = "inicio";

  if (["oi", "ola", "boa tarde", "bom dia", "boa noite", "oopa", "eai"].some(kw => normalizedText.startsWith(kw))) {
    intent = "saudacao";
    stage = "inicio";
  } else if (hasSupportSignal) {
    intent = "suporte";
    stage = "suporte";
  } else if (hasPriceQuestion) {
    intent = "consulta_preco";
    stage = "negociacao";
  } else if (hasPaymentSignal) {
    intent = "pagamento";
    stage = "pos_venda";
  } else if (hasPurchaseSignal && hasQuantity) {
    intent = "compra";
    stage = "fechamento";
  } else if (normalizedText.includes("seguro") || normalizedText.includes("cai") || normalizedText.includes("golpe")) {
    intent = "duvida_seguranca";
    stage = "qualificacao";
  } else if (normalizedText.includes("como") || normalizedText.includes("serviço") || normalizedText.includes("trabalha")) {
    intent = "descoberta";
    stage = "apresentacao";
  }

  // Refinamento de Stage baseado no histórico
  if (history.length > 3 && stage === "inicio") {
    stage = "qualificacao";
  }

  return {
    intent,
    stage,
    platform,
    product,
    hasQuantity,
    hasPriceQuestion,
    hasPaymentSignal,
    hasSupportSignal,
    hasPurchaseSignal,
    confidence: 0.85
  };
}

/**
 * Seleção inteligente de módulos baseada em contexto
 */
export function selectModulesV3(
  text: string,
  history: Array<{ role: "agent" | "customer"; content: string }>,
  enabledModules: string[]
): SelectionResultV3 {
  const context = detectConversationContext(text, history);
  const normalizedText = text.toLowerCase();
  const selectedKeys = new Set<string>(["identidade", "regras_gerais", "comportamento_humano"]);
  const reasons: Record<string, string> = {
    identidade: "Módulo obrigatório",
    regras_gerais: "Módulo obrigatório",
    comportamento_humano: "Módulo obrigatório"
  };

  // 1. Plataforma e Produto
  if (context.platform) {
    const key = context.platform === "instagram" ? "instagram" : 
                context.platform === "youtube" ? "youtube" :
                context.platform === "spotify" ? "spotify" : 
                context.platform === "tiktok" ? "tiktok" : null;
    if (key && enabledModules.includes(key)) {
      selectedKeys.add(key);
      reasons[key] = `Plataforma ${context.platform} identificada no contexto`;
    }
  }

  if (context.product) {
    // Mapeamento de produto para módulo se necessário, ou apenas reforça a plataforma
    if (context.product === "seguidores" && enabledModules.includes("fluxo_vendas")) {
      selectedKeys.add("fluxo_vendas");
      reasons["fluxo_vendas"] = "Produto 'seguidores' requer fluxo de vendas";
    }
  }

  // 2. Intent & Stage
  if (context.intent === "suporte") {
    selectedKeys.add("suporte_pos_compra");
    reasons["suporte_pos_compra"] = "Intenção de suporte detectada";
  } else if (context.intent === "compra" || context.intent === "consulta_preco") {
    selectedKeys.add("fluxo_vendas");
    selectedKeys.add("psicologia_vendas");
    selectedKeys.add("tabela_precos");
    reasons["fluxo_vendas"] = "Interesse comercial detectado";
    reasons["tabela_precos"] = "Pergunta sobre valores ou intenção de compra";
  }

  if (context.stage === "fechamento") {
    selectedKeys.add("fechamento_vendas");
    reasons["fechamento_vendas"] = "Estágio de fechamento identificado";
  }

  if (context.intent === "duvida_seguranca") {
    selectedKeys.add("objecoes_vendas");
    selectedKeys.add("prova_social");
    reasons["objecoes_vendas"] = "Dúvida sobre segurança ou confiança";
  }

  if (context.hasPaymentSignal) {
    selectedKeys.add("pagamentos");
    reasons["pagamentos"] = "Sinal de pagamento (Pix/valor) detectado";
  }

  // 3. Fallback Determinístico (Baseado em palavras isoladas se nada foi selecionado além do core)
  if (selectedKeys.size <= 3) {
    for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
      if (keywords.some(kw => normalizedText.includes(kw))) {
        if (enabledModules.includes(moduleKey)) {
          selectedKeys.add(moduleKey);
          reasons[moduleKey] = `Fallback: Palavra-chave '${keywords.find(kw => normalizedText.includes(kw))}' encontrada`;
        }
      }
    }
  }

  return {
    context,
    selectedModules: Array.from(selectedKeys).filter(k => enabledModules.includes(k) || ["identidade", "regras_gerais", "comportamento_humano"].includes(k)),
    selectionReasons: reasons
  };
}

export function selectRelevantModules(text: string | null | undefined, enabledModules: string[]): string[] {
  // Legado para manter compatibilidade onde history não é passado
  const result = selectModulesV3(text || "", [], enabledModules);
  return result.selectedModules;
}

export function buildPromptFromModules(
  keys: string[], 
  customModules: Record<string, string | { content: string; source: string; fallback_reason?: string }>
): string {
  return keys
    .map(key => {
      const mod = customModules[key];
      if (!mod) return "";
      
      const content = typeof mod === "string" ? mod : mod.content;
      const source = typeof mod === "string" ? "code/unknown" : mod.source;
      const version = (mod as any).version || (mod as any).isOverride ? "DB" : "V1";

      return `[MODULE: ${key} | origin: ${source} | version: ${version}]\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
