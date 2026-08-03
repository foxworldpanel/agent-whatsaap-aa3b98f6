import type { LoadedModuleV3 } from "../brain/modules.server";


export type ConversationMessageV3 = {
  role: "agent" | "customer";
  content: string;
};

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
  platform: "instagram" | "youtube" | "spotify" | "tiktok" | "kwai" | "facebook" | "outra" | null;
  product:
    | "seguidores"
    | "curtidas"
    | "visualizacoes"
    | "inscritos"
    | "plays"
    | "ouvintes"
    | "saves"
    | "playlist"
    | "live"
    | "horas"
    | "comentarios"
    | null;
  hasQuantity: boolean;
  hasPriceQuestion: boolean;
  hasPaymentSignal: boolean;
  hasPaidSignal: boolean;
  hasSupportSignal: boolean;
  hasPurchaseSignal: boolean;
  hasGrowthGoal: boolean;
  confidence: number;
};

export type SelectionResultV3 = {
  context: ConversationContext;
  selectedModules: string[];
  selectionReasons: Record<string, string>;
};

const MAX_PRIMARY_MODULES = 11;
const RECENT_CUSTOMER_MESSAGES = 12;

export const KEYWORD_MAP: Record<string, string[]> = {
  // Plataforma deve vir de nome/variante explícita. Produto não pode escolher rede sozinho.
  // Antes, “plays” fazia o selector inferir Spotify e “likes/views” inferiam YouTube,
  // o que misturava módulos quando o cliente falava de várias redes.
  spotify: ["spotify", "spotfy", "sportify", "espotify", "espotfy"],
  instagram: ["instagram", "insta", "ig", "reels", "story", "stories"],
  youtube: ["youtube", "you tube", "yt", "inscritos", "horas", "canal"],
  tiktok: ["tiktok", "tik tok"],
  kwai: ["kwai"],
  facebook: ["facebook", "face"],
  pagamentos: [
    "pix",
    "pagar",
    "pagamento",
    "comprovante",
    "paguei",
    "fiz o pix",
    "saldo",
    "recarga",
  ],
  tabela_precos: [
    "tabela",
    "precos",
    "lista",
    "valores",
    "qual o valor",
    "quanto custa",
    "valor",
    "preco",
    "custa",
    "quanto fica",
  ],
  suporte: [
    "suporte",
    "ticket",
    "problema",
    "erro",
    "meu pedido",
    "status do pedido",
    "pedido em andamento",
    "pedido pendente",
    "status",
    "nao chegou",
    "atraso",
    "recarga nao caiu",
    "sumiu",
    "nao entregou",
    "faltando",
  ],

  seguranca: [
    "teste",
    "gratis",
    "amostra",
    "confiavel",
    "golpe",
    "funciona",
    "testar",
    "seguro",
    "senha",
    "banimento",
    "risco",
    "pode cair",
  ],
  como_usar_painel: [
    "como usar",
    "cadastro",
    "site",
    "link",
    "painel",
    "cadastrar",
  ],
  prova_social: [
    "confianca",
    "seguro",
    "alguem ja comprou",
    "funciona mesmo",
    "prova",
    "print",
    "depoimento",
  ],
  objecoes_vendas: ["bot", "garantia", "barato", "funciona mesmo", "confiar", "golpe"],
  fechamento: [
    "vou querer",
    "pode fazer",
    "manda o link",
    "vou levar",
    "fechar",
    "quero comprar",
    "quero esse",
    "me manda",
    "como faco",
    "como eu compro",
  ],

};

const PLATFORM_PATTERNS: Array<[NonNullable<ConversationContext["platform"]>, string[]]> = [
  ["instagram", KEYWORD_MAP.instagram],
  ["youtube", KEYWORD_MAP.youtube],
  ["spotify", KEYWORD_MAP.spotify],
  ["tiktok", KEYWORD_MAP.tiktok],
  ["kwai", KEYWORD_MAP.kwai],
  ["facebook", KEYWORD_MAP.facebook],
];

const PRODUCT_PATTERNS: Array<[NonNullable<ConversationContext["product"]>, string[]]> = [
  ["seguidores", ["seguidor", "seguidores"]],
  ["curtidas", ["curtida", "curtidas", "like", "likes"]],
  ["visualizacoes", ["visualizacao", "visualizacoes", "view", "views"]],
  ["inscritos", ["inscrito", "inscritos"]],
  ["plays", ["play", "plays", "stream", "streams"]],
  ["ouvintes", ["ouvinte", "ouvintes", "ouvinte mensal", "ouvintes mensais"]],
  ["saves", ["save", "saves", "salvar", "salvamentos"]],
  ["playlist", ["playlist", "playlists"]],
  ["live", ["live", "pessoas na live"]],
  ["horas", ["hora", "horas", "watch time"]],
  ["comentarios", ["comentario", "comentarios"]],
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Faz correspondência por palavra/frase inteira sobre texto já normalizado.
 * Evita falsos positivos de substring, por exemplo "face" dentro de
 * "interface" ou "live" dentro de outra palavra.
 */
function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return false;
    const phrase = escapeRegex(normalizedTerm).replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|\\s)${phrase}(?=$|\\s)`).test(text);
  });
}

function matchingContextValues<T>(text: string, patterns: Array<[T, string[]]>): T[] {
  const matches = patterns
    .filter(([, terms]) => containsAny(text, terms))
    .map(([value]) => value);

  // “Plays + Ouvintes” é um único SKU comercial no Spotify. Para roteamento
  // de preço tratamos a dupla como `plays`, evitando marcar a mensagem como
  // ambígua só porque o nome oficial contém as duas métricas.
  const asStrings = new Set(matches.map((value) => String(value)));
  if (asStrings.size === 2 && asStrings.has("plays") && asStrings.has("ouvintes")) {
    return ["plays" as T];
  }

  return matches;
}

function findUniqueContextValue<T>(
  currentText: string,
  recentDialogueTexts: string[],
  patterns: Array<[T, string[]]>,
): T | null {
  const current = matchingContextValues(currentText, patterns);
  if (current.length === 1) return current[0];
  if (current.length > 1) return null;

  // Varre a conversa de trás para frente. Mensagens sem contexto são puladas;
  // a primeira mensagem que aponta para UMA rede/produto vira o assunto ativo.
  // Se a mensagem mais recente com contexto listar várias opções, paramos como
  // ambíguo em vez de resgatar uma rede antiga.
  for (const dialogueText of recentDialogueTexts) {
    const matches = matchingContextValues(dialogueText, patterns);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return null;
}

export function detectConversationContext(
  text: string,
  history: ConversationMessageV3[] = [],
  remembered?: Partial<Pick<ConversationContext, "platform" | "product">>,
): ConversationContext {
  const normalizedText = normalizeText(text);
  const recentCustomerText = history
    .filter((item) => item.role === "customer")
    .slice(-RECENT_CUSTOMER_MESSAGES)
    .map((item) => normalizeText(item.content))
    .join(" ");
  const recentDialogueTexts = history
    .slice(-RECENT_CUSTOMER_MESSAGES)
    .reverse()
    .map((item) => normalizeText(item.content));
  const lastAgentText = normalizeText(
    [...history].reverse().find((item) => item.role === "agent")?.content || "",
  );

  let platform = findUniqueContextValue(
    normalizedText,
    recentDialogueTexts,
    PLATFORM_PATTERNS,
  );
  let product = findUniqueContextValue(
    normalizedText,
    recentDialogueTexts,
    PRODUCT_PATTERNS,
  );
  // Alguns produtos são exclusivos o bastante para recuperar a plataforma sem
  // depender de palavras genéricas como “plays”, “likes” ou “views”.
  if (!platform && (product === "ouvintes" || product === "saves")) platform = "spotify";
  if (!platform && (product === "inscritos" || product === "horas")) platform = "youtube";

  // A memória persistida é somente fallback: uma informação explícita no turno
  // atual ou no histórico recente sempre tem prioridade.
  if (!platform && remembered?.platform) platform = remembered.platform;
  if (!product && remembered?.product) product = remembered.product;

  const accumulatedCustomerText = [recentCustomerText, normalizedText].filter(Boolean).join(" ");

  // Jornada acumulada serve para memória/inteligência. A intenção DO TURNO usa
  // os sinais atuais para não deixar uma pergunta antiga de preço/pagamento
  // contaminar todas as mensagens seguintes.
  const quantityPattern = /\b(?:\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|trez|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:k|mil)?\b/;
  const hasQuantity = quantityPattern.test(accumulatedCustomerText);
  const currentHasQuantity = quantityPattern.test(normalizedText);
  const currentHasPriceQuestion = containsAny(normalizedText, KEYWORD_MAP.tabela_precos);
  const hasPriceQuestion = currentHasPriceQuestion || containsAny(accumulatedCustomerText, KEYWORD_MAP.tabela_precos);
  const currentHasPaidSignal = containsAny(normalizedText, [
    "ja paguei", "paguei", "fiz o pix", "enviei o pix", "mandei o comprovante",
    "saldo nao caiu", "recarga nao caiu",
  ]);
  const hasPaidSignal = currentHasPaidSignal || containsAny(accumulatedCustomerText, [
    "ja paguei",
    "paguei",
    "fiz o pix",
    "enviei o pix",
    "mandei o comprovante",
    "saldo nao caiu",
    "recarga nao caiu",
  ]);
  const currentHasPaymentSignal =
    currentHasPaidSignal ||
    containsAny(normalizedText, [
      "pix", "manda o pix", "manda pix", "me manda o pix", "me passa o pix",
      "passa o pix", "qual o pix", "chave pix", "como pagar", "como faco o pix",
      "como fazer o pix", "aceita pix", "quero pagar", "vou pagar", "onde pago",
      "pagar agora", "pagamento", "comprovante", "recarga", "saldo",
    ]);
  const hasPaymentSignal =
    currentHasPaymentSignal ||
    hasPaidSignal ||
    containsAny(accumulatedCustomerText, [
      "pix",
      "manda o pix",
      "manda pix",
      "me manda o pix",
      "me passa o pix",
      "passa o pix",
      "qual o pix",
      "chave pix",
      "como pagar",
      "como faco o pix",
      "como fazer o pix",
      "aceita pix",
      "quero pagar",
      "vou pagar",
      "onde pago",
      "pagar agora",
      "pagamento",
      "comprovante",
      "recarga",
      "saldo",
    ]);
  const hasSupportSignal = containsAny(normalizedText, KEYWORD_MAP.suporte);
  const currentHasPurchaseSignal =
    containsAny(normalizedText, KEYWORD_MAP.fechamento) ||
    containsAny(normalizedText, ["comprar", "quero", "preciso de"]);
  const hasPurchaseSignal =
    currentHasPurchaseSignal ||
    containsAny(accumulatedCustomerText, KEYWORD_MAP.fechamento) ||
    containsAny(accumulatedCustomerText, ["comprar", "quero", "preciso de"]);
  // Sistema de pontuação pra sinal de segurança — substitui o "OR" binário
  // anterior, onde uma única palavra genérica (ex: "funciona") disparava
  // o mesmo peso que uma palavra realmente específica (ex: "golpe").
  // Palavras de peso alto disparam sozinhas; palavras de peso baixo
  // precisam se combinar (ou aparecer mais de uma vez) pra cruzar o limiar.
  const SECURITY_KEYWORD_WEIGHTS: Record<string, number> = {
    golpe: 10,
    fraude: 10,
    banimento: 10,
    senha: 6,
    risco: 3,
    confiavel: 2,
    seguro: 2,
    funciona: 1,
    testar: 1,
    teste: 1,
    gratis: 1,
    amostra: 1,
  };
  const SECURITY_SIGNAL_THRESHOLD = 5;
  const securityScore =
    Object.entries(SECURITY_KEYWORD_WEIGHTS).reduce(
      (sum, [word, weight]) => sum + (containsAny(normalizedText, [word]) ? weight : 0),
      0,
    ) + (containsAny(normalizedText, ["vai cair", "pode cair", "tem risco"]) ? 6 : 0);
  const hasSecuritySignal = securityScore >= SECURITY_SIGNAL_THRESHOLD;

  // Log de auditoria do score — mostra exatamente quais palavras
  // contribuíram e quanto, pra facilitar revisão futura sem precisar
  // reconstruir a conta manualmente.
  if (securityScore > 0) {
    const contribuicoes = Object.entries(SECURITY_KEYWORD_WEIGHTS)
      .filter(([word]) => containsAny(normalizedText, [word]))
      .map(([word, weight]) => `${word}=${weight}`);
    if (containsAny(normalizedText, ["vai cair", "pode cair", "tem risco"])) {
      contribuicoes.push("vai/pode cair ou tem risco=6");
    }
    console.log("[SECURITY-SCORE]", {
      mensagem: text.slice(0, 80),
      contribuicoes,
      total: securityScore,
      limiar: SECURITY_SIGNAL_THRESHOLD,
      authorized: hasSecuritySignal ? "YES" : "NO",
    });
  }

  const hasGrowthGoal = containsAny(normalizedText, [
    "engajar", "engajamento", "divulgar minha musica", "divulgar a musica",
    "crescer minha musica", "mais alcance", "dar visibilidade", "promover minha musica"
  ]);
  const hasRecommendationQuestion = containsAny(normalizedText, [
    "qual voce me indica", "o que voce me indica", "qual me indica",
    "o que recomenda", "qual recomenda", "qual voce recomenda",
  ]);

  let intent: ConversationContext["intent"] = "desconhecido";
  let stage: ConversationContext["stage"] = history.length === 0 ? "inicio" : "qualificacao";

  const isPureGreeting = /^(oi|ola|opa|e ai|eai|bom dia|boa tarde|boa noite)( tudo bem)?$/.test(
    normalizedText,
  );
  const isAffirmativeReply = /^(sim|quero|pode ser|isso|isso mesmo|beleza|blz|ok|certo)$/.test(
    normalizedText,
  );
  const agentAskedPrice = containsAny(lastAgentText, [
    "quer saber os valores", "quer saber o valor", "quer ver os valores",
    "quanto custa", "qual valor", "preco", "precos", "valor", "valores",
  ]);
  const agentAskedToBuy = containsAny(lastAgentText, [
    "quer contratar", "quer comecar", "quer fazer", "quer comprar", "vamos com",
  ]);
  const continuationPrice = isAffirmativeReply && agentAskedPrice && Boolean(platform);
  const continuationPurchase = isAffirmativeReply && agentAskedToBuy && Boolean(platform);

  if (currentHasPaidSignal || (hasSupportSignal && currentHasPaymentSignal)) {
    intent = "pos_compra";
    stage = "pos_venda";
  } else if (hasSupportSignal) {
    intent = "suporte";
    stage = "suporte";
  } else if (hasSecuritySignal) {
    intent = "duvida_seguranca";
    stage = "qualificacao";
  } else if (currentHasPaymentSignal) {
    // Pagamento tem prioridade sobre sinais genéricos de compra como "quero".
    // Ex.: "quero pagar" / "manda o pix" já são fechamento, não nova qualificação.
    intent = "pagamento";
    stage = "fechamento";
  } else if (continuationPrice) {
    intent = "consulta_preco";
    stage = "negociacao";
  } else if (continuationPurchase) {
    intent = "compra";
    stage = product || currentHasQuantity ? "fechamento" : "negociacao";
  } else if (hasRecommendationQuestion && (platform || product)) {
    intent = "descoberta";
    stage = "negociacao";
  } else if (hasGrowthGoal) {
    // O cliente informou o objetivo, não necessariamente sabe qual SKU comprar.
    // A Júlia deve assumir papel consultivo em vez de devolver outro menu.
    intent = "descoberta";
    stage = "apresentacao";
  } else if (currentHasPurchaseSignal) {
    intent = "compra";
    stage = currentHasQuantity || product ? "fechamento" : "negociacao";
  } else if (
    history.length > 0 &&
    platform &&
    product &&
    hasQuantity &&
    containsAny(normalizedText, ["ok", "beleza", "blz", "vou olhar", "vou ver", "entendi", "certo"])
  ) {
    // Confirmações curtas preservam o estágio comercial acumulado.
    intent = "compra";
    stage = "fechamento";
  } else if (
    history.length > 0 &&
    hasPaymentSignal &&
    /(?:^|\s)(?:ok|beleza|blz|certo|ta bom|boa noite|bom dia|boa tarde|ate amanha|amanha)(?:\s|$)/.test(normalizedText)
  ) {
    // Um encerramento curto depois de combinar pagamento não devolve o lead
    // para Qualificação/Outro. Preserva fechamento até o cliente concluir.
    intent = "pagamento";
    stage = "fechamento";
  } else if (currentHasPriceQuestion) {
    intent = "consulta_preco";
    stage = "negociacao";
  } else if (
    containsAny(normalizedText, [
      "como funciona",
      "como voces trabalham",
      "como usar",
      "quais servicos",
      "o que voces fazem",
    ])
  ) {
    intent = "descoberta";
    stage = "apresentacao";
  } else if (containsAny(normalizedText, ["obrigado", "valeu", "ate mais", "tchau"])) {
    intent = "encerramento";
    stage = "pos_venda";
  } else if (isPureGreeting) {
    intent = "saudacao";
    stage = "inicio";
  }

  let confidence = 0.45;
  if (intent !== "desconhecido") confidence += 0.2;
  if (platform) confidence += 0.1;
  if (product) confidence += 0.1;
  if (hasQuantity || hasPriceQuestion || hasPaymentSignal || hasSupportSignal || hasPurchaseSignal)
    confidence += 0.1;
  if (normalizedText.length < 3) confidence -= 0.15;
  confidence = Math.max(0.2, Math.min(0.98, Number(confidence.toFixed(2))));

  return {
    intent,
    stage,
    platform,
    product,
    hasQuantity,
    hasPriceQuestion,
    hasPaymentSignal,
    hasPaidSignal,
    hasSupportSignal,
    hasPurchaseSignal,
    hasGrowthGoal,
    confidence,
  };
}

export function selectModulesV3(
  text: string,
  history: ConversationMessageV3[],
  modules: Record<string, LoadedModuleV3>,
  remembered?: Partial<Pick<ConversationContext, "platform" | "product">>,
  runId?: string,
): SelectionResultV3 {
  const context = detectConversationContext(text, history, remembered);
  const normalizedText = normalizeText(text);
  const selected = new Set<string>();
  const reasons: Record<string, string> = {};

  const orderedModules = Object.entries(modules).sort(
    ([, a], [, b]) => b.routing.priority - a.routing.priority,
  );

  const add = (key: string, reason: string, options?: { required?: boolean }) => {
    if (!modules[key] || selected.has(key)) return;
    if (!options?.required && selected.size >= MAX_PRIMARY_MODULES) return;
    selected.add(key);
    reasons[key] ||= reason;
  };

  // Toda decisão de carregamento vem dos metadados do CMS.
  for (const [key, module] of orderedModules) {
    const routing = module.routing;
    if (routing.alwaysLoad || key === "identidade" || key === "regras_gerais") {
      // Módulos always_load e estruturais são obrigatórios e não podem ser
      // descartados pelo limite de módulos primários.
      add(
        key,
        routing.alwaysLoad ? "always_load definido no CMS" : "Módulo estrutural V3",
        { required: true },
      );
    }


    if (routing.intents.includes(context.intent)) {
      add(key, `Intenção ${context.intent} definida no CMS`);
    }
    if (routing.stages.includes(context.stage)) {
      add(key, `Estágio ${context.stage} definido no CMS`);
    }
    if (context.platform && routing.platforms.includes(context.platform)) {
      // Módulos de plataforma "amplos" podem ser selecionados apenas pela rede.
      // Submódulos especializados (preços, prazos, garantia, links etc.) só entram
      // quando também houver intenção, produto ou gatilho compatível. Isso evita
      // carregar toda a família spotify_* / youtube_* em cada turno.
      const hasFineGrainedRouting =
        routing.intents.length > 0 ||
        routing.stages.length > 0 ||
        routing.products.length > 0 ||
        routing.triggers.length > 0;

      if (!hasFineGrainedRouting) {
        add(key, `Plataforma ${context.platform} definida no CMS`);
      }
    }
    // Compatibilidade com módulos legados de chave exata da plataforma.
    // Depois da migração modular eles ficam desativados, mas workspaces antigos
    // continuam funcionando até serem migrados.
    if (context.platform && key === context.platform) {
      add(key, `Módulo legado correspondente à plataforma ${context.platform}`, { required: true });
    }
    if (context.product && routing.products.includes(context.product)) {
      add(key, `Produto ${context.product} definido no CMS`);
    }

    const trigger = routing.triggers.find((term) => containsAny(normalizedText, [term]));
    if (trigger) add(key, `Gatilho “${trigger}” definido no CMS`);
  }

  // Instagram pode possuir vários submódulos comerciais ao mesmo tempo
  // (Global, Brasil promocional, Brasil Premium etc.). Em pergunta de preço,
  // comparação ou fechamento de seguidores, carregamos TODAS as fontes
  // relevantes da família em vez de deixar o LLM enxergar apenas uma variante.
  if (
    context.platform === "instagram" &&
    context.product === "seguidores" &&
    (
      context.intent === "consulta_preco" ||
      context.intent === "compra" ||
      context.intent === "pagamento" ||
      context.stage === "negociacao" ||
      context.stage === "fechamento" ||
      context.hasPriceQuestion
    )
  ) {
    const instagramCommercialCandidates = orderedModules.filter(([key, module]) => {
      if (key === "instagram") return false;

      const content = normalizeText(module.content || "");
      const belongsToInstagram =
        key.startsWith("instagram_") ||
        module.routing.platforms.includes("instagram");

      if (!belongsToInstagram) return false;

      const talksAboutFollowers =
        containsAny(content, ["seguidor", "seguidores"]);

      const looksCommercial =
        /r\s*\$/.test((module.content || "").toLowerCase()) ||
        containsAny(content, [
          "preco",
          "valor",
          "promocional",
          "premium",
          "global",
          "brasil",
          "minimo",
          "entrega",
        ]);

      return talksAboutFollowers && looksCommercial;
    });

    for (const [key] of instagramCommercialCandidates.slice(0, 8)) {
      add(
        key,
        "Fonte comercial Instagram/Seguidores relevante para comparar todas as opções cadastradas",
        { required: true },
      );
    }

    if (instagramCommercialCandidates.length > 0) {
      selected.delete("instagram");
      delete reasons.instagram;
      selected.delete("tabela_precos");
      delete reasons.tabela_precos;
    }
  }

  // Autoridade comercial por plataforma: submódulo específico vence módulos
  // genéricos/legados. Isso evita duas tabelas de preço competindo no prompt.
  if (selected.has("spotify_precos")) {
    selected.delete("tabela_precos");
    delete reasons.tabela_precos;
    selected.delete("spotify");
    delete reasons.spotify;
  }
  if (selected.has("spotify_royalties")) {
    selected.delete("spotify");
    delete reasons.spotify;
  }

  // Dependências são resolvidas transitivamente depois da seleção inicial.
  // O loop por fila garante A -> B -> C, além de impedir ciclos infinitos.
  const dependencyQueue = Array.from(selected);
  const expandedDependencies = new Set<string>();
  while (dependencyQueue.length > 0) {
    const key = dependencyQueue.shift();
    if (!key || expandedDependencies.has(key)) continue;
    expandedDependencies.add(key);

    for (const dependency of modules[key]?.routing.dependencies || []) {
      const wasSelected = selected.has(dependency);
      add(dependency, `Dependência do módulo ${key}`, { required: true });
      if (!wasSelected && selected.has(dependency)) dependencyQueue.push(dependency);
    }
  }

  // Conflitos: mantém o módulo de maior prioridade; em empate, mantém o primeiro.
  for (const key of Array.from(selected)) {
    if (!selected.has(key)) continue;

    for (const conflict of modules[key]?.routing.conflicts || []) {
      if (!selected.has(conflict)) continue;
      const currentPriority = modules[key]?.routing.priority || 0;
      const conflictPriority = modules[conflict]?.routing.priority || 0;
      if (currentPriority >= conflictPriority) {
        selected.delete(conflict);
        delete reasons[conflict];
      } else {
        selected.delete(key);
        delete reasons[key];
        break;
      }
    }
  }

  // FILTROS NEGATIVOS DETERMINÍSTICOS — nunca adicionam módulo, só
  // removem quando falta uma dependência lógica óbvia (plataforma ou
  // produto que o próprio módulo declara exigir no CMS). Não depende do
  // Flow Engine "decidir" nada, não é IA, não é inferência — é regra
  // matemática: se o módulo é específico de plataforma/produto e a
  // conversa ainda não identificou isso, ele não pode ser relevante,
  // não importa por qual outro caminho (intent/stage/trigger) tenha
  // entrado. Módulos CORE (sem platforms/products definidos) não são
  // afetados por nenhum dos dois filtros.
  const negativeFilters: Array<{
    label: string;
    scoped: (routing: LoadedModuleV3["routing"]) => boolean;
    matches: (routing: LoadedModuleV3["routing"]) => boolean;
    causeValue: string;
    authorizedByValue: (routing: LoadedModuleV3["routing"]) => unknown;
  }> = [
    {
      label: "selector_platforms",
      scoped: (routing) => routing.platforms.length > 0,
      matches: (routing) => Boolean(context.platform) && routing.platforms.includes(context.platform as string),
      causeValue: `platform=${context.platform ?? "null"}`,
      authorizedByValue: (routing) => routing.platforms,
    },
    {
      label: "selector_products",
      scoped: (routing) => routing.products.length > 0,
      matches: (routing) => Boolean(context.product) && routing.products.includes(context.product as string),
      causeValue: `product=${context.product ?? "null"}`,
      authorizedByValue: (routing) => routing.products,
    },
    {
      // Rede de segurança: um módulo explicitamente restrito a um stage
      // específico (ex: só "fechamento") não deveria sobreviver se a
      // conversa está noutro stage, mesmo que tenha entrado por outro
      // caminho (trigger/intent). Só afeta módulos que DECLARAM stage —
      // "qualificacao" sozinho não conta como restrição forte o
      // suficiente pra remover nada (é o estágio mais genérico).
      label: "selector_stages",
      scoped: (routing) => routing.stages.length > 0 && !routing.stages.includes("qualificacao"),
      matches: (routing) => routing.stages.includes(context.stage),
      causeValue: `stage=${context.stage}`,
      authorizedByValue: (routing) => routing.stages,
    },
  ];

  const filterSummary: Record<string, number> = {};
  let tokensEconomizados = 0;
  const candidatosAntes = selected.size;

  for (const key of Array.from(selected)) {
    const routing = modules[key]?.routing;
    if (!routing) continue;
    for (const filter of negativeFilters) {
      if (!filter.scoped(routing)) continue;
      if (filter.matches(routing)) continue;
      selected.delete(key);
      delete reasons[key];
      filterSummary[filter.label] = (filterSummary[filter.label] ?? 0) + 1;
      tokensEconomizados += Math.round((modules[key]?.content?.length ?? 0) / 4);
      console.log("[MODULE FILTER]", {
        modulo: key,
        AUTHORIZED_BY: `${filter.label}=${JSON.stringify(filter.authorizedByValue(routing))}`,
        STATUS: "REMOVED",
        CAUSE: filter.causeValue,
      });
      break; // já removido, não precisa checar os outros filtros pra esse módulo
    }
  }

  if (candidatosAntes > 0) {
    console.log("===================================");
    console.log("MODULE FILTER SUMMARY");
    if (runId) console.log(`RUN ID: ${runId}`);
    console.log(`Candidates: ${candidatosAntes}`);
    for (const [label, count] of Object.entries(filterSummary)) {
      console.log(`Removed by ${label}: ${count}`);
    }
    console.log(`Remaining: ${selected.size}`);
    console.log(`Estimated Tokens Saved: ${tokensEconomizados}`);
    console.log("===================================");
  }


  // Um conflito pode remover uma dependência obrigatória. Nesse caso, manter o
  // módulo dependente produziria um prompt incompleto e potencialmente contraditório.
  // Remove dependentes inválidos de forma transitiva até a seleção estabilizar.
  let removedInvalidDependency = true;
  while (removedInvalidDependency) {
    removedInvalidDependency = false;

    for (const key of Array.from(selected)) {
      const missingDependency = (modules[key]?.routing.dependencies || []).find(
        (dependency) => !selected.has(dependency),
      );
      if (!missingDependency) continue;

      selected.delete(key);
      delete reasons[key];
      removedInvalidDependency = true;
      console.warn(
        `[agent-v3-selector] Módulo ${key} removido porque a dependência obrigatória ${missingDependency} não permaneceu após a resolução de conflitos.`,
      );
    }
  }

  return {
    context,
    selectedModules: Array.from(selected),
    selectionReasons: Object.fromEntries(Array.from(selected).map((key) => [key, reasons[key]])),
  };
}

/**
 * Log de diagnóstico da execução real do Module Selector — mostra,
 * módulo por módulo, se foi carregado e por quê (ou por que não).
 * Não altera nenhum comportamento, só imprime evidência.
 */
export function logModuleSelectorExecution(
  message: string,
  context: ConversationContext,
  modules: Record<string, LoadedModuleV3>,
  selectedModules: string[],
  selectionReasons: Record<string, string>,
  runId?: string,
): void {
  const selectedSet = new Set(selectedModules);
  const lines: string[] = [];
  let runningTotal = 0;

  // Categorias pra resumo final — classifica cada motivo de seleção.
  const categoryTotals: Record<string, { count: number; tokens: number }> = {
    always_load: { count: 0, tokens: 0 },
    selector_stage: { count: 0, tokens: 0 },
    selector_platform: { count: 0, tokens: 0 },
    selector_product: { count: 0, tokens: 0 },
    selector_intent: { count: 0, tokens: 0 },
    selector_trigger: { count: 0, tokens: 0 },
    outro: { count: 0, tokens: 0 },
  };

  function classifyReason(reason: string): keyof typeof categoryTotals {
    if (reason.includes("always_load") || reason.includes("estrutural")) return "always_load";
    if (reason.includes("Estágio")) return "selector_stage";
    if (reason.includes("Plataforma") || reason.includes("legado correspondente")) return "selector_platform";
    if (reason.includes("Produto")) return "selector_product";
    if (reason.includes("Intenção")) return "selector_intent";
    if (reason.includes("Gatilho")) return "selector_trigger";
    return "outro";
  }

  lines.push("===============================");
  lines.push("[MODULE SELECTOR]");
  if (runId) lines.push(`RUN ID: ${runId}`);
  lines.push(`Mensagem: "${message.slice(0, 80)}"`);
  lines.push("");
  lines.push("Context detectado:");
  lines.push(`stage=${context.stage} intent=${context.intent} platform=${context.platform ?? "null"} product=${context.product ?? "null"}`);
  lines.push("");
  lines.push("Módulos avaliados:");

  const orderedForLog = Object.entries(modules).sort(
    ([, a], [, b]) => b.routing.priority - a.routing.priority,
  );

  for (const [key, module] of orderedForLog) {
    const routing = module.routing;
    const chars = (module.content || "").length;
    const tokens = Math.round(chars / 4);

    if (selectedSet.has(key)) {
      runningTotal += tokens;
      const reason = selectionReasons[key] ?? "desconhecido";
      const category = classifyReason(reason);
      categoryTotals[category].count += 1;
      categoryTotals[category].tokens += tokens;

      // AUTHORIZED BY — formato campo=valor explícito, elimina qualquer
      // ambiguidade sobre o que exatamente autorizou o carregamento.
      let authorizedBy = "desconhecido";
      if (category === "always_load") authorizedBy = "always_load=true";
      else if (category === "selector_stage") authorizedBy = `selector_stage=${context.stage}`;
      else if (category === "selector_platform") authorizedBy = `selector_platform=${context.platform}`;
      else if (category === "selector_product") authorizedBy = `selector_product=${context.product}`;
      else if (category === "selector_intent") authorizedBy = `selector_intent=${context.intent}`;
      else if (category === "selector_trigger") {
        const triggerMatch = reason.match(/Gatilho\s*[""]([^""]+)[""]/);
        authorizedBy = `selector_trigger=${triggerMatch?.[1] ?? "?"}`;
      }

      lines.push(`✓ ${key}`);
      lines.push(`  AUTHORIZED BY: ${authorizedBy}`);
      lines.push(`  Motivo completo: ${reason}`);
      lines.push(`  Chars: ${chars} | Tokens: ~${tokens} | Running total: ~${runningTotal}`);

      // Detalhe campo-por-campo pra motivos de stage/platform/product/intent —
      // ajuda a confirmar visualmente o match exato.
      if (category === "selector_stage") {
        lines.push(`  Campo responsável: selector_stages | Valor esperado: contém "${context.stage}" | Valor encontrado: ${JSON.stringify(routing.stages)} | MATCH`);
      } else if (category === "selector_platform" && context.platform) {
        lines.push(`  Campo responsável: selector_platforms | Valor esperado: contém "${context.platform}" | Valor encontrado: ${JSON.stringify(routing.platforms)} | MATCH`);
      } else if (category === "selector_product" && context.product) {
        lines.push(`  Campo responsável: selector_products | Valor esperado: contém "${context.product}" | Valor encontrado: ${JSON.stringify(routing.products)} | MATCH`);
      } else if (category === "selector_intent") {
        lines.push(`  Campo responsável: selector_intents | Valor esperado: contém "${context.intent}" | Valor encontrado: ${JSON.stringify(routing.intents)} | MATCH`);
      }
    } else {
      const motivosNegativos: string[] = [];
      if (!routing.alwaysLoad) motivosNegativos.push("always_load=false");
      if (!routing.intents.includes(context.intent)) motivosNegativos.push(`intent atual (${context.intent}) não está em selector_intents`);
      if (!routing.stages.includes(context.stage)) motivosNegativos.push(`stage atual (${context.stage}) não está em selector_stages`);
      if (!context.platform || !routing.platforms.includes(context.platform)) motivosNegativos.push(`platform (${context.platform ?? "null"}) não bate com selector_platforms`);
      if (!context.product || !routing.products.includes(context.product)) motivosNegativos.push(`product (${context.product ?? "null"}) não bate com selector_products`);
      lines.push(`✗ ${key} — Não carregado (${chars} chars, ~${tokens} tokens que foram evitados)`);
      lines.push(`  Motivo: ${motivosNegativos.join("; ")}`);
    }
  }

  lines.push("");
  lines.push("=== RESUMO POR CATEGORIA ===");
  for (const [cat, data] of Object.entries(categoryTotals)) {
    if (data.count > 0) {
      lines.push(`${cat}: ${data.count} módulo(s), ~${data.tokens} tokens`);
    }
  }

  lines.push("");
  lines.push(`Total módulos carregados: ${selectedModules.length}`);
  lines.push(`Total tokens estimados (só módulos): ~${runningTotal}`);
  lines.push("===============================");

  console.log(lines.join("\n"));
}
