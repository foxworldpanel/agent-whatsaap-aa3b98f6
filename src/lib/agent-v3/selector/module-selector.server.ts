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
  spotify: ["spotify", "playlist", "ouvintes", "streams", "save", "plays", "podcast"],
  instagram: ["instagram", "insta", "ig", "reels", "story", "stories"],
  youtube: ["youtube", "yt", "inscritos", "views", "likes", "horas", "canal"],
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
    "quanto e",
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
    "ajuda",
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
    "entrar",
    "site",
    "link",
    "painel",
    "conta",
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
  ["ouvintes", ["ouvinte", "ouvintes"]],
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

function findContextValue<T>(
  currentText: string,
  recentCustomerText: string,
  patterns: Array<[T, string[]]>,
): T | null {
  for (const [value, terms] of patterns) {
    if (containsAny(currentText, terms)) return value;
  }
  for (const [value, terms] of patterns) {
    if (containsAny(recentCustomerText, terms)) return value;
  }
  return null;
}

export function detectConversationContext(
  text: string,
  history: ConversationMessageV3[] = [],
): ConversationContext {
  const normalizedText = normalizeText(text);
  const recentCustomerText = history
    .filter((item) => item.role === "customer")
    .slice(-RECENT_CUSTOMER_MESSAGES)
    .map((item) => normalizeText(item.content))
    .join(" ");

  const platform = findContextValue(normalizedText, recentCustomerText, PLATFORM_PATTERNS);
  const product = findContextValue(normalizedText, recentCustomerText, PRODUCT_PATTERNS);
  const accumulatedCustomerText = [recentCustomerText, normalizedText].filter(Boolean).join(" ");

  // Sinais comerciais são acumulativos. Uma última mensagem curta como "ok",
  // "beleza" ou um novo gatilho de anúncio não pode apagar que o cliente já
  // escolheu produto, quantidade ou chegou ao pagamento.
  const hasQuantity = /\b\d+(?:[.,]\d+)?\s*(?:k|mil)?\b/.test(accumulatedCustomerText);
  const hasPriceQuestion = containsAny(accumulatedCustomerText, KEYWORD_MAP.tabela_precos);
  const hasPaidSignal = containsAny(accumulatedCustomerText, [
    "ja paguei",
    "paguei",
    "fiz o pix",
    "enviei o pix",
    "mandei o comprovante",
    "saldo nao caiu",
    "recarga nao caiu",
  ]);
  const hasPaymentSignal =
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
  const hasPurchaseSignal =
    containsAny(accumulatedCustomerText, KEYWORD_MAP.fechamento) ||
    containsAny(accumulatedCustomerText, ["comprar", "quero", "preciso de"]);
  const hasSecuritySignal =
    containsAny(normalizedText, KEYWORD_MAP.seguranca) ||
    containsAny(normalizedText, ["vai cair", "pode cair", "tem risco"]);
  const hasGrowthGoal = containsAny(normalizedText, [
    "engajar", "engajamento", "divulgar minha musica", "divulgar a musica",
    "crescer minha musica", "mais alcance", "dar visibilidade", "promover minha musica"
  ]);

  let intent: ConversationContext["intent"] = "desconhecido";
  let stage: ConversationContext["stage"] = history.length === 0 ? "inicio" : "qualificacao";

  const isPureGreeting = /^(oi|ola|opa|e ai|eai|bom dia|boa tarde|boa noite)( tudo bem)?$/.test(
    normalizedText,
  );

  if (hasPaidSignal || (hasSupportSignal && hasPaymentSignal)) {
    intent = "pos_compra";
    stage = "pos_venda";
  } else if (hasSupportSignal) {
    intent = "suporte";
    stage = "suporte";
  } else if (hasSecuritySignal) {
    intent = "duvida_seguranca";
    stage = "qualificacao";
  } else if (hasPaymentSignal) {
    // Pagamento tem prioridade sobre sinais genéricos de compra como "quero".
    // Ex.: "quero pagar" / "manda o pix" já são fechamento, não nova qualificação.
    intent = "pagamento";
    stage = "fechamento";
  } else if (hasGrowthGoal) {
    // O cliente informou o objetivo, não necessariamente sabe qual SKU comprar.
    // A Júlia deve assumir papel consultivo em vez de devolver outro menu.
    intent = "descoberta";
    stage = "apresentacao";
  } else if (hasPurchaseSignal) {
    intent = "compra";
    stage = hasQuantity || product ? "fechamento" : "negociacao";
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
  } else if (hasPriceQuestion) {
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
): SelectionResultV3 {
  const context = detectConversationContext(text, history);
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
