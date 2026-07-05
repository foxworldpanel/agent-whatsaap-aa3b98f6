// Server-only Claude (Anthropic) call to generate the agent reply.
import { buildSharedRules, DEFAULT_IDENTITY, loadAgentIdentity, loadBrandBlocks, mergeIdentity, type AgentBrandBlocks } from "@/lib/agent-identity.server";

type AgentConfig = {
  agent_name: string;
  tone: string;
  base_instruction: string;
  script_frio: string;
  script_inativo: string;
  script_ativo: string;
  main_offer: string;
  panel_link: string | null;
  company_info?: unknown;
  how_it_works?: string | null;
  never_offer_first?: boolean | null;
  send_panel_on_price?: boolean | null;
  faqs?: unknown;
  services_realtime?: boolean | null;
  price_query_instruction?: string | null;
};

type Contact = {
  nome: string;
  perfil: "frio" | "inativo" | "ativo";
};

type Msg = { sender: "agente" | "cliente"; body: string; created_at?: string | null };

function getLatestClientMessage(history: Msg[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.sender === "cliente" && msg.body?.trim()) return msg.body.trim();
  }
  return "";
}

// Detecta se a conversa já saiu do "momento de abertura de disparo" — ou seja,
// já entrou em suporte/pós-venda/atendimento sobre pedido em andamento. Quando
// verdadeiro, a regra de "interesse amplo" (qualquer 'ok'/'blz' avança pro
// funil) NÃO deve ser aplicada, mesmo que a thread tenha sido originada de um
// disparo. Serve como guarda determinística contra o modelo reiniciar o funil
// de vendas dentro de uma conversa de suporte.
export function isSupportOrPostSaleContext(history: Msg[]): boolean {
  const agentMsgs = history.filter((m) => m.sender === "agente" && m.body?.trim());
  if (agentMsgs.length === 0) return false;
  // Se a agente já perguntou rede/serviço/quantidade OU já respondeu sobre
  // pedido/status/painel/saldo/ticket/processando/pendente/pagamento, isso não
  // é mais "logo após abertura de disparo". A pergunta de abertura em si
  // ("posso te mostrar...") NÃO casa com nenhum desses padrões, então é seguro
  // varrer TODAS as mensagens da agente sem falso positivo na abertura.
  const supportRx =
    /(qual\s+rede|qual\s+servi[cç]o|qual\s+plataforma|quer\s+impulsionar|status|pedido|painel|saldo|ticket|processando|pendente|entregue|order\s*id|comprovante|pagamento|pix)/i;
  for (const m of agentMsgs) {
    if (supportRx.test(m.body)) return true;
  }
  return false;
}

// Detecta REENGAJAMENTO após hiato: a última mensagem do cliente é apenas uma
// saudação/cortesia curta, e passaram mais de ~3h desde a última mensagem da
// agente. Nesse caso o modelo deve retribuir a saudação e AGUARDAR o cliente
// dizer o que quer, em vez de emendar automaticamente a próxima pergunta do
// funil pendente (bug real observado: pergunta de views/inscritos disparada
// depois de "Boa tarde" no dia seguinte).
const GREETING_ONLY_RX =
  /^\s*(oi+|ol[aá]+|opa+|eae|e\s*a[ií]|hey|hi|hello|bom\s*dia|boa\s*tarde|boa\s*noite|tudo\s*bem\??|tudo\s*bom\??|blz\??|beleza\??)\s*[.!?…]*\s*$/i;

export function isReengagementGreeting(history: Msg[], nowIso?: string): boolean {
  if (!history?.length) return false;
  // Última mensagem do cliente
  let clientIdx = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].sender === "cliente" && history[i].body?.trim()) {
      clientIdx = i;
      break;
    }
  }
  if (clientIdx < 0) return false;
  const clientMsg = history[clientIdx];
  const body = (clientMsg.body ?? "").trim();
  // Saudação/cortesia curta (até ~30 chars) e sem sinal de intenção comercial
  if (body.length > 30) return false;
  if (!GREETING_ONLY_RX.test(body)) return false;
  // Última mensagem da agente ANTES dessa do cliente
  let agentBefore: Msg | null = null;
  for (let i = clientIdx - 1; i >= 0; i -= 1) {
    if (history[i].sender === "agente" && history[i].body?.trim()) {
      agentBefore = history[i];
      break;
    }
  }
  if (!agentBefore) return false;
  const agentTs = agentBefore.created_at ? Date.parse(agentBefore.created_at) : NaN;
  const clientTs = clientMsg.created_at
    ? Date.parse(clientMsg.created_at)
    : nowIso
      ? Date.parse(nowIso)
      : Date.now();
  if (!Number.isFinite(agentTs) || !Number.isFinite(clientTs)) return false;
  const gapMs = clientTs - agentTs;
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  return gapMs >= THREE_HOURS;
}

// Vocabulário canônico de "serviços" para casar tópicos de conversa/reply com o
// que está na lista de teste grátis liberado. Chave = token que aparece no
// texto; valor = família de serviço.
const SERVICE_TOPIC_TOKENS: Array<{ rx: RegExp; family: string }> = [
  { rx: /\bviews?\b|\bvisualiza(ç|c)[oõ]es?\b/i, family: "views" },
  { rx: /\bseguidor(es)?\b|\bfollow(ers?)?\b|\binscrit[oa]s?\b/i, family: "seguidores" },
  { rx: /\bcurtidas?\b|\blikes?\b/i, family: "curtidas" },
  { rx: /\bplays?\b|\bexecu(ç|c)[oõ]es?\b/i, family: "plays" },
  { rx: /\bouvintes?\b|\blisteners?\b/i, family: "ouvintes" },
  { rx: /\bcoment[aá]rios?\b|\bcomments?\b/i, family: "comentarios" },
  { rx: /\bcompartilhament[oa]s?\b|\bshares?\b/i, family: "compartilhamentos" },
  { rx: /\bsalvamentos?\b|\bsaves?\b/i, family: "saves" },
  { rx: /\bhoras?\s+de\s+exibi(ç|c)[aã]o\b|\bwatch\s*time\b|\bmonetiza(ç|c)[aã]o\b/i, family: "horas_exibicao" },
];

function extractFamilies(text: string): Set<string> {
  const out = new Set<string>();
  for (const { rx, family } of SERVICE_TOPIC_TOKENS) {
    if (rx.test(text)) out.add(family);
  }
  return out;
}

// Guarda de segurança pós-geração: bloqueia qualquer promessa de "teste
// grátis" quando o serviço mencionado NÃO está na lista de elegíveis.
// Retorna { text, replaced, reason } — quando replaced=true, o texto original
// foi trocado por uma deflexão segura.
// Remove tiques de escrita de IA — em-dash / en-dash no meio de frases.
// Substitui " — " / " – " por ", " e remove o dash quando cercado por
// espaços em contextos ambíguos. Preserva hífen normal em palavras
// compostas ("bem-vindo") e o marcador "===SPLIT===".
export function humanizePunctuation(input: string): string {
  if (!input) return input;
  let out = input;
  // dash com espaços dos dois lados => vírgula
  out = out.replace(/\s+[—–]\s+/g, ", ");
  // dash colado a um dos lados no meio de palavra => espaço
  out = out.replace(/([^\s])[—–]([^\s])/g, "$1, $2");
  // colapsa vírgulas duplas / vírgula antes de pontuação
  out = out.replace(/,\s*,/g, ",").replace(/,\s*([.!?…;:])/g, "$1");
  return out;
}

export function guardFreeTrialOffer(params: {
  reply: string;
  freeTestServices: Array<{ service_name: string; category: string }>;
}): { text: string; replaced: boolean; reason?: string } {
  const { reply, freeTestServices } = params;
  // Detecta menção a "teste grátis/gratuito" (evita falso positivo em "de graça").
  const mentionsFreeTrial = /(teste\s+gr[aá]tis|teste\s+gratuit[oa]|gr[aá]tis\s+(pra|para)\s+(voc[eê]|vc)|amostra\s+gr[aá]tis|libero\s+um\s+teste|te\s+mand[oa]\s+.{0,20}gr[aá]tis|faço\s+.{0,30}gr[aá]tis|coloco\s+.{0,30}gr[aá]tis)/i.test(reply);
  if (!mentionsFreeTrial) return { text: reply, replaced: false };

  const allowedFamilies = new Set<string>();
  for (const s of freeTestServices) {
    for (const f of extractFamilies(`${s.service_name} ${s.category}`)) allowedFamilies.add(f);
  }

  const replyFamilies = extractFamilies(reply);

  // Se a resposta menciona uma família de serviço que NÃO está liberada
  // (ou não há nenhum serviço liberado), bloqueia a oferta.
  const mentionsForbidden = [...replyFamilies].some((f) => !allowedFamilies.has(f));
  const noEligibleAtAll = freeTestServices.length === 0;

  if (!mentionsForbidden && !noEligibleAtAll && replyFamilies.size > 0) {
    return { text: reply, replaced: false };
  }

  const forbiddenTopic = [...replyFamilies].find((f) => !allowedFamilies.has(f));
  const safeDeflection =
    "Pra esse serviço não tenho teste grátis liberado, mas dá pra começar com a menor quantidade paga pra você sentir o resultado sem se comprometer. Quer que eu te passe o valor?";
  return {
    text: safeDeflection,
    replaced: true,
    reason: noEligibleAtAll
      ? "no_eligible_services"
      : forbiddenTopic
        ? `topic_not_eligible:${forbiddenTopic}`
        : "ambiguous_free_trial_mention",
  };
}

function pickScript(cfg: AgentConfig, perfil: Contact["perfil"]): string {
  return perfil === "ativo"
    ? cfg.script_ativo
    : perfil === "inativo"
    ? cfg.script_inativo
    : cfg.script_frio;
}

// Sempre carregados (essenciais ao comportamento do agente)
const ESSENTIAL_MODULES = [
  "identidade",
  "regras_proibidas",
  "regras_gerais",
  "comportamento_humano",
  "texto_ou_audio",
  "fluxo_vendas",
  "pagamentos",
];

// Mapa de gatilhos → módulos relevantes
const MODULE_TRIGGERS: Array<{ rx: RegExp; modules: string[] }> = [
  { rx: /spotify|playlist|ouvintes?|saves?|m[uú]sica|artista|soundon/i, modules: ["spotify", "musica_cliente"] },
  { rx: /youtube|yt|inscritos?|view(s|er)?|monetiza|4000h|shorts?/i, modules: ["youtube"] },
  { rx: /instagram|insta|\big\b|reels?|stories?|seguidor/i, modules: ["instagram"] },
  { rx: /tiktok|tt\b/i, modules: ["tiktok"] },
  { rx: /kwai/i, modules: ["kwai"] },
  { rx: /facebook|fb\b|\bface\b/i, modules: ["facebook"] },
  { rx: /google|seo|maps|gmb|avalia[çc][aã]o/i, modules: ["seo_google"] },
  { rx: /pre[çc]o|valor|quanto custa|custa|tabela|or[çc]amento|cota[çc][aã]o|\br\$/i, modules: ["calculo_preco", "ancoragem_valor"] },
  { rx: /desconto|barato|caro|promo/i, modules: ["desconto_niveis", "objecoes", "ancoragem_valor"] },
  { rx: /pix|pagar|pagamento|boleto|cart[aã]o|cripto|usdt|d[oó]lar|exterior|estrangeir/i, modules: ["pagamentos", "estrangeiros"] },
  { rx: /teste|gr[aá]tis|free|amostra/i, modules: ["teste_gratis"] },
  { rx: /problema|n[aã]o funcionou|n[aã]o recebi|atras|suporte|ticket|reclama|refil/i, modules: ["suporte", "historico_refil", "inteligencia_emocional"] },
  { rx: /painel|cadastr|conta|login|saldo|dep[oó]sito|adicionar fundos|como uso/i, modules: ["como_usar_painel", "guia_visual_painel", "educacao"] },
  { rx: /n[aã]o quero|depois|talvez|caro demais|pensar/i, modules: ["objecoes", "fechamento_3", "follow_up"] },
  { rx: /comprei|fechei|paguei|comprovante|pedido feito/i, modules: ["pos_venda", "upsell"] },
  { rx: /sumiu|voltei|faz tempo|de novo/i, modules: ["reativacao_frio", "recuperacao_silencio"] },
];

function selectActiveModules(
  mods: Record<string, string>,
  enabled: Record<string, boolean>,
  latestMessage: string,
): Array<[string, string]> {
  const wanted = new Set<string>(ESSENTIAL_MODULES);
  const msg = latestMessage.toLowerCase();
  for (const trig of MODULE_TRIGGERS) {
    if (trig.rx.test(msg)) trig.modules.forEach((m) => wanted.add(m));
  }
  return Object.entries(mods).filter(([k, v]) => {
    if (!v || !String(v).trim()) return false;
    if (enabled[k] === false) return false;
    // Nunca injetar o módulo de saudação por horário no agente receptivo.
    // Variação de saudação por horário é EXCLUSIVA do disparo ativo
    // (src/lib/blast-variations.ts) — Júlia responde no tom natural
    // definido na instrução base, sem forçar "bom dia/boa tarde/boa noite".
    if (k === "tom_horario") return false;
    return wanted.has(k);
  });
}

// Detecta o contexto principal da conversa com base na última mensagem
// e nas últimas 3 mensagens do histórico. Usado para logar/observar qual
// "categoria" o agente identificou e dimensionar custo de tokens.
export function detectarContexto(mensagem: string, historico: Msg[]): string {
  const trailing = historico.slice(-3).map((m) => m.body ?? "").join(" ");
  const texto = `${mensagem} ${trailing}`.toLowerCase();
  if (/spotify|plays|ouvintes|saves|playlist|m[uú]sica|can[çc][aã]o|streaming/i.test(texto)) return "spotify";
  if (/youtube|shorts|inscritos|monetiz|horas|canal|v[ií]deo/i.test(texto)) return "youtube";
  if (/instagram|reels|stories|curtidas|seguidores insta/i.test(texto)) return "instagram";
  if (/tiktok|\btok\b/i.test(texto)) return "tiktok";
  if (/facebook|\bfb\b/i.test(texto)) return "facebook";
  if (/kwai/i.test(texto)) return "kwai";
  if (/google|avalia[çc][aã]o|estrelas/i.test(texto)) return "google";
  if (/pre[çc]o|valor|quanto|custa|cobr/i.test(texto)) return "preco";
  if (/teste|gr[aá]tis|gratuito/i.test(texto)) return "teste";
  if (/cadastro|painel|pix|pagamento|saldo/i.test(texto)) return "painel";
  if (/pedido|entrega|status|cancelar|reembolso|refil/i.test(texto)) return "suporte";
  return "geral";
}

type BuildPromptParams = {
  agent: AgentConfig;
  contact: Contact;
  history: Msg[];
  servicesContext?: string | null;
  isInbound?: boolean;
  funnelAlreadySent?: boolean;
  knowledgeExamples?: Array<{ context?: string | null; content: string }>;
  panelScreens?: Array<{ name: string; description?: string | null; extracted_content?: string | null }>;
  forbiddenRules?: Array<{ rule: string; deflection?: string | null }>;
  freeTestServices?: Array<{ service_id: string; service_name: string; category: string; quantity: number }>;
  userId?: string | null;
  /**
   * Identidade opcional (parcial). Se fornecida, mescla com DEFAULT_IDENTITY
   * (safety-only). Usado por testes/preview de diagnóstico para injetar um
   * template Mind e validar comportamento brand-específico. Em produção, o
   * prompt real vem de generateAgentReplyWithMeta, que carrega do DB.
   */
  identity?: Partial<import("./agent-identity.server").AgentIdentityFields> | null;
  /**
   * Brand blocks opcionais (Passo 3 do refactor). Se fornecido, é injetado
   * em buildSharedRules. Em produção vem de agent_config.brand_blocks;
   * aqui é usado por testes/diagnóstico pra injetar o template Mind.
   */
  brandBlocks?: AgentBrandBlocks | null;
};

export function buildSystemPrompt(params: BuildPromptParams): string {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [], panelScreens = [], forbiddenRules = [], freeTestServices = [], identity, brandBlocks = null } = params;
  // Nota: buildSystemPrompt é síncrono (só usado por diagnostics como preview).
  // O prompt real de produção usa generateAgentReplyWithMeta, que carrega
  // a identidade do banco. Aqui usamos defaults + `buildSharedRules` sem I/O.
  const sharedRules = buildSharedRules(mergeIdentity(identity ?? null), { freeTestServices, brandBlocks });
  const latestClientMessage = getLatestClientMessage(history);
  const system = [
    sharedRules,
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    `DETECÇÃO DE CONTEXTO POR CONTEÚDO (backup, independente de flags técnicas): se você observar no histórico que a primeira mensagem sua tem padrão de abertura de disparo, menciona "Peguei o seu contato", "Vi seu perfil", "@" de instagram, ou uma pergunta inicial do tipo "Posso te apresentar/mostrar uma forma de impulsionar...", trate essa conversa como thread de DISPARO e siga o EXEMPLO_MODELO_DISPARO da identidade: interesse inicial vai direto para pergunta de rede, depois serviço, preço e só então objeção. O conteúdo real da conversa prevalece sobre metadados técnicos.`,
    `PRIORIDADE ABSOLUTA PARA PERGUNTAS DIRETAS: se a última mensagem do cliente contém uma pergunta direta (nome, preço, serviço específico, prazo, cadastro, pagamento, link ou qualquer dúvida objetiva), responda essa pergunta imediatamente. NUNCA ignore uma pergunta direta e NUNCA troque por explicação genérica da MIND/plataforma. Se o cliente perguntou seu nome, responda algo curto e natural como: "Meu nome é Júlia, e o seu?" ou "Sou a Júlia, como posso te ajudar?" — sem emoji.`,
    `Você é ${agent.agent_name}, atendente humana de um painel SMM.`,
    `Tom de voz: ${agent.tone}.`,
    agent.base_instruction,
    `REGRA #1 (ACIMA DE TUDO): SEMPRE responda exatamente o que o cliente perguntou na ÚLTIMA mensagem.`,
    knowledgeExamples.length > 0
      ? `==== BASE DE CONHECIMENTO (${knowledgeExamples.length} exemplos) ====\n${knowledgeExamples.map((ex, i) => `--- Exemplo ${i + 1}${ex.context ? ` — ${ex.context}` : ""} ---\n${ex.content}`).join("\n\n")}\n==== FIM ====`
      : "",
    panelScreens.length > 0
      ? `==== GUIA DO PAINEL (${panelScreens.length} telas) ====\n${panelScreens.map((s, i) => `--- Tela ${i + 1}: ${s.name} ---${s.description ? `\n${s.description}` : ""}${s.extracted_content ? `\n${s.extracted_content}` : ""}`).join("\n\n")}\n==== FIM ====`
      : "",
    (() => {
      const ci = agent.company_info as Record<string, string> | null | undefined;
      return ci && typeof ci === "object"
        ? `SOBRE A EMPRESA:\n- Nome: ${ci.name ?? ""}\n- Tipo: ${ci.type ?? ""}\n- Serviços: ${ci.services ?? ""}\n- Plataformas: ${ci.platforms ?? ""}\n- Catálogo: ${ci.catalog_link ?? ""}\n- Painel: ${ci.panel_link ?? ""}\n- Pagamentos: ${ci.payments ?? ""}`
        : "";
    })(),
    agent.how_it_works ? `COMO FUNCIONA O PAINEL:\n${agent.how_it_works}` : "",
    (() => {
      const faqs = agent.faqs as Array<{ q: string; a: string }> | null | undefined;
      return Array.isArray(faqs) && faqs.length > 0
        ? `FAQ (${faqs.length}):\n${faqs.map((f) => `- ${f.q} → ${f.a}`).join("\n")}`
        : "";
    })(),
    servicesContext
      ? `CATÁLOGO DE SERVIÇOS DO PAINEL (atualizado agora). Formato:\nID: <id> | Nome: <nome> | Categoria: <cat> | Preço por 1000: R$<rate> | MÍNIMO: <min> | MÁXIMO: <max>\n\n${servicesContext}\n\nREGRAS DE PREÇO: SEMPRE consulte MÍNIMO antes de informar quantidade. Se cliente pedir abaixo do MÍNIMO, ofereça o MÍNIMO.`
      : "",
    servicesContext && agent.price_query_instruction
      ? `INSTRUÇÃO ESPECÍFICA PARA PREÇOS:\n${agent.price_query_instruction}`
      : "",
    forbiddenRules.length > 0
      ? `REGRAS ABSOLUTAS PROIBIDAS (${forbiddenRules.length}):\n${forbiddenRules.map((r, i) => `${i + 1}. 🚫 ${r.rule}${r.deflection ? ` → Desvio: "${r.deflection}"` : ""}`).join("\n")}`
      : "",
    freeTestServices.length > 0
      ? `TESTE GRÁTIS DISPONÍVEL (${freeTestServices.length} serviços):\n${freeTestServices.map((s) => `- ${s.service_name} (${s.category}) — ${s.quantity} grátis`).join("\n")}`
      : "",
    `Perfil do contato: ${contact.perfil}.${isInbound ? " Atendimento receptivo." : ""}${funnelAlreadySent ? " Funil de boas-vindas já enviado." : ""}`,
    // Split e emoji: fonte única é identity.regra_split / identity.regra_emoji
    // via buildSharedRules (não duplicar aqui).
  ]
    .filter(Boolean)
    .join("\n\n");
  return system;
}

export async function generateAgentReply(params: {
  anthropicApiKey?: string | null;
  agent: AgentConfig;
  contact: Contact;
  history: Msg[];
  servicesContext?: string | null;
  isInbound?: boolean;
  funnelAlreadySent?: boolean;
  knowledgeExamples?: Array<{ context?: string | null; content: string }>;
  panelScreens?: Array<{ name: string; description?: string | null; extracted_content?: string | null }>;
  forbiddenRules?: Array<{ rule: string; deflection?: string | null }>;
  freeTestServices?: Array<{ service_id: string; service_name: string; category: string; quantity: number }>;
  extraContext?: string | null;
  inputKind?: "texto" | "audio";
  imageBase64?: string | null;
  imageMediaType?: string | null;
  userId?: string | null;
}): Promise<string> {
  const { text } = await generateAgentReplyWithMeta(params);
  return text;
}

// Regra de roteamento HAIKU/SONNET — exportada para logs/auditoria.
// Sonnet quando: há imagem, áudio, mensagem longa (>400 chars) ou palavras
// que indicam análise/reclamação/suporte complexo. Caso contrário, Haiku.
export function pickClaudeModel(opts: {
  hasImage: boolean;
  inputKind?: "texto" | "audio";
  latestMessage?: string | null;
}): { model: "claude-sonnet-4-5" | "claude-haiku-4-5"; reason: string } {
  const msg = (opts.latestMessage ?? "").trim();
  if (opts.hasImage) return { model: "claude-sonnet-4-5", reason: "image_present" };
  if (opts.inputKind === "audio") return { model: "claude-sonnet-4-5", reason: "audio_input" };
  if (msg.length > 400) return { model: "claude-sonnet-4-5", reason: "long_message" };
  const complexRe = /(reclama|problema|n[aã]o funcion|nunca funcion|reembolso|cancelar|golpe|an[aá]lise|analisa|print|comprovante|preju[ií]zo|erro|urgente|processo|proced|jur[ií]dic)/i;
  if (complexRe.test(msg)) return { model: "claude-sonnet-4-5", reason: "complex_keywords" };
  return { model: "claude-haiku-4-5", reason: "default_text" };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isBlastOpeningQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    /posso\s+(te\s+)?(mostrar|apresentar|mandar|falar|explicar)/i.test(normalized) &&
    /(impulsionar|turbinar|acelerar|ajudar|crescer|divulgar|bombar|melhorar|redes?|perfil|instagram|conteudo)/i.test(normalized)
  );
}

function isClearBlastRefusal(text: string): boolean {
  const normalized = normalizeText(text);
  return /^(nao|n|no)\b/.test(normalized) || /(nao\s+(quero|tenho interesse|precisa|obrigad)|sem interesse|agora nao|not interested|no thanks|no thank you|no necesito|no quiero)/i.test(normalized);
}

// Saudação/cortesia neutra em resposta à abertura ("bom dia", "oi", "boa tarde"...).
// NÃO é resposta afirmativa à pergunta — é só reciprocidade social. Nesses casos
// devolvemos null pra deixar o LLM responder aplicando a regra de 3 categorias
// (retribuir saudação + refazer a pergunta de abertura) em vez de pular o funil.
function isBlastNeutralGreeting(text: string): boolean {
  const normalized = normalizeText(text).replace(/[!?.,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  // Remove vocativos comuns ("oi julia", "oi tudo bem") para checar o núcleo.
  const greetingOnly = /^(oi+|ola|ol[aá]|hello|hi|hey|e ai|eae|salve|bom dia|boa tarde|boa noite|buenos dias|buenas tardes|buenas noches|good morning|good afternoon|good evening|tudo bem|tudo bom|td bem|td bom|como vai|como vc esta|como voce esta|how are you|que tal)(\s+(oi+|ola|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|td bom|julia|j[uú]lia|amigo|amiga|moc[ao]|linda|lindo))*$/i;
  return greetingOnly.test(normalized);
}

function getIdentityInitialBlastInterestReply(identity: typeof DEFAULT_IDENTITY): string {
  const example = identity.exemplo_disparo ?? DEFAULT_IDENTITY.exemplo_disparo;
  const match = example.match(/Cliente:\s*"[^"]+"[^\n]*\nJúlia:\s*"([^"]+)"/i);
  return humanizePunctuation(match?.[1]?.trim() || "Show! Bora ver o que mais combina com você. Qual rede social você mais usa hoje em dia?");
}

export function getInitialBlastInterestReply(history: Msg[], identity: typeof DEFAULT_IDENTITY = DEFAULT_IDENTITY): string | null {
  const latestClientIndex = (() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.sender === "cliente" && history[i]?.body?.trim()) return i;
    }
    return -1;
  })();

  if (latestClientIndex < 0) return null;

  const latestClientBody = history[latestClientIndex]?.body ?? "";
  if (isClearBlastRefusal(latestClientBody)) return null;
  // Cortesia neutra ("oi", "bom dia", ...) NÃO é afirmação: deixa o LLM aplicar
  // a regra de 3 categorias (retribuir + refazer a pergunta de abertura).
  if (isBlastNeutralGreeting(latestClientBody)) return null;

  let lastAgentBeforeClient: Msg | null = null;
  for (let i = latestClientIndex - 1; i >= 0; i -= 1) {
    if (history[i]?.sender === "agente" && history[i]?.body?.trim()) {
      lastAgentBeforeClient = history[i];
      break;
    }
  }

  if (!lastAgentBeforeClient || !isBlastOpeningQuestion(lastAgentBeforeClient.body)) return null;

  return getIdentityInitialBlastInterestReply(identity);
}

export async function generateAgentReplyWithMeta(params: {
  anthropicApiKey?: string | null;
  agent: AgentConfig;
  contact: Contact;
  history: Msg[];
  servicesContext?: string | null;
  isInbound?: boolean;
  funnelAlreadySent?: boolean;
  knowledgeExamples?: Array<{ context?: string | null; content: string }>;
  panelScreens?: Array<{ name: string; description?: string | null; extracted_content?: string | null }>;
  forbiddenRules?: Array<{ rule: string; deflection?: string | null }>;
  freeTestServices?: Array<{ service_id: string; service_name: string; category: string; quantity: number }>;
  extraContext?: string | null;
  inputKind?: "texto" | "audio";
  imageBase64?: string | null;
  imageMediaType?: string | null;
  userId?: string | null;
}): Promise<{ text: string; model: string; routingReason: string }> {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [], panelScreens = [], forbiddenRules = [], freeTestServices: freeTestServicesRaw = [], extraContext = null, inputKind = "texto", imageBase64 = null, imageMediaType = null, userId = null } = params;
  const latestClientMessage = getLatestClientMessage(history);

  // FONTE ÚNICA DE IDENTIDADE — carrega do banco (com fallback pros defaults)
  // e injeta como PRIMEIRO bloco do system prompt (posição de primazia máxima).
  const [identity, brandBlocks] = await Promise.all([
    loadAgentIdentity(userId),
    loadBrandBlocks(userId),
  ]);
  // NOTA: interceptador determinístico `getInitialBlastInterestReply` foi
  // removido — o Claude decide TUDO relacionado a conteúdo. A função ainda
  // é exportada apenas para testes que validam a heurística de detecção.

  // GATE DUPLO para teste grátis:
  // 1) Spotify NUNCA tem teste grátis — remove do catálogo proativo independente do que estiver salvo.
  // 2) Só expõe o bloco "TESTE GRÁTIS DISPONÍVEL" se o cliente pediu explicitamente
  //    (teste/grátis/gratuito/experimentar/testar/amostra) OU demonstrou desconfiança/medo
  //    (confiável/confiavel/golpe/seguro/funciona mesmo/é real/prova).
  const freeTestServices = freeTestServicesRaw.filter((s) => {
    const blob = `${s.service_name} ${s.category}`.toLowerCase();
    return !blob.includes("spotify");
  });
  const lastMsgLower = (latestClientMessage ?? "").toLowerCase();
  const clientAskedForTrial = /\b(teste|testar|testa|gr[aá]tis|gratuito|gratuita|experimentar|amostra)\b/i.test(lastMsgLower);
  const clientShowedDistrust = /(confi[aá]vel|golpe|seguro|funciona mesmo|é real|e real|tem prova|tem como provar|garantia)/i.test(lastMsgLower);
  const exposeFreeTrialBlock = freeTestServices.length > 0 && (clientAskedForTrial || clientShowedDistrust);

  const supportContext = isSupportOrPostSaleContext(history);
  const reengagementGreeting = isReengagementGreeting(history);

  // O fluxo de disparo agora vem exclusivamente de buildSharedRules(identity).
  const system = [
    // VETO DE PRIORIDADE MÁXIMA: o bloco MODO REENGAJAMENTO precede a
    // identidade (buildSharedRules), o EXEMPLO_MODELO_DISPARO e qualquer
    // refinamento de tom consultivo. Sem isso, em threads de disparo o modelo
    // reencaixa a próxima pergunta do funil mesmo depois de horas de hiato +
    // saudação seca do cliente.
    reengagementGreeting
      ? (isInbound
          // CASO 1 — RECEPTIVO / SUPORTE: cliente iniciou o contato. Reengajar
          // com "como posso ajudar" — não existe "isca" a reapresentar.
          ? `⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (RECEPTIVO) ⛔\nEste bloco SOBRESCREVE, nesta resposta, TODA a identidade abaixo, o EXEMPLO_MODELO_DISPARO, os refinamentos de tom do disparo, a ORDEM OBRIGATÓRIA do funil, qualquer regra de "interesse inicial pós-abertura", qualquer instrução de "vá direto para a pergunta de rede/serviço/quantidade" e QUALQUER lógica de disparo/blast/funil de vendas.\n\nCondição detectada: passaram VÁRIAS HORAS (ou virou o dia) desde a sua última mensagem, e o cliente voltou APENAS com uma saudação curta ("oi", "olá", "bom dia", "boa tarde", "boa noite", "tudo bem"). Esta conversa é RECEPTIVA (o cliente iniciou o contato originalmente).\n\nOBRIGAÇÕES desta resposta:\n1) Retribua a saudação e se coloque à disposição de forma neutra. FORMATO OBRIGATÓRIO: "<Saudação equivalente à do cliente>! Como posso ajudar?" (ex: "Boa tarde! Como posso ajudar?" / "Oi! Tudo bem por aí? Como posso te ajudar hoje?").\n2) PROIBIDO emendar automaticamente/repetir/reformular QUALQUER pergunta pendente do funil (rede, serviço, quantidade, "qual desses você quer priorizar", CTA, link do painel, preço, teste grátis, ancoragem).\n3) AGUARDE a próxima mensagem do cliente antes de retomar qualquer coisa.\n4) NÃO despache ===SPLIT===, NÃO envie link, NÃO cite preço, NÃO faça pergunta de negócio nesta resposta.`
          // CASO 2 — DISPARO / BLAST: a Júlia iniciou o contato via abordagem
          // fria. Reengajar REAPRESENTANDO A ISCA (pergunta final da abertura)
          // de forma resumida — o cliente pode ter esquecido o assunto.
          : `⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (DISPARO) ⛔\nEste bloco SOBRESCREVE, nesta resposta, TODA a identidade abaixo, o EXEMPLO_MODELO_DISPARO, os refinamentos de tom do disparo, a ORDEM OBRIGATÓRIA do funil, qualquer regra de "interesse inicial pós-abertura", qualquer instrução de "vá direto para a pergunta de rede/serviço/quantidade" e QUALQUER pergunta pendente do funil que exista no histórico.\n\nCondição detectada: passaram VÁRIAS HORAS (ou virou o dia) desde a sua última mensagem em uma thread de DISPARO (VOCÊ iniciou o contato via abordagem fria), e o cliente voltou APENAS com uma saudação curta. Ele pode ter esquecido completamente do que se tratava — precisa reancorar o interesse.\n\nOBRIGAÇÕES desta resposta:\n1) Retribua a saudação e REAPRESENTE A ISCA — a pergunta FINAL da abertura de disparo, de forma RESUMIDA. FORMATO OBRIGATÓRIO em UMA ÚNICA mensagem curta: "<Saudação equivalente à do cliente>! Posso te mostrar como acelerar suas redes?" (variações válidas: "...como turbinar suas redes?" / "...como impulsionar seu perfil?"). Nada além disso.\n2) PROIBIDO repetir a abertura COMPLETA — NÃO diga "Peguei seu contato no perfil @...", NÃO cite o @ do Instagram, NÃO cumprimente pelo nome como se fosse a primeira mensagem, NÃO diga "adorei o conteúdo/estilo". Só a pergunta-isca final, resumida.\n3) PROIBIDO emendar/repetir/reformular a pergunta PENDENTE do funil (rede, serviço, quantidade, "qual desses você quer priorizar", CTA, link do painel, preço, teste grátis, ancoragem). Você está VOLTANDO para a pergunta-isca da abertura, NÃO avançando o funil.\n4) NÃO despache ===SPLIT===, NÃO envie link, NÃO cite preço nesta resposta.\n5) Depois desta resposta, se o cliente responder de novo com interesse ("sim", "pode", "manda", "claro"), a PRÓXIMA resposta CONTINUA o funil de onde parou (retomar a pergunta pendente — ex: rede social) SEM repetir a abertura completa novamente.`)
      : "",
    buildSharedRules(identity, { freeTestServices, brandBlocks }),
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    `DETECÇÃO DE CONTEXTO POR CONTEÚDO (backup, independente de flags técnicas): se você observar no histórico que a primeira mensagem sua tem padrão de abertura de disparo, menciona "Peguei o seu contato", "Vi seu perfil", "@" de instagram, ou uma pergunta inicial do tipo "Posso te apresentar/mostrar uma forma de impulsionar...", trate essa conversa como thread de DISPARO e siga o EXEMPLO_MODELO_DISPARO da identidade: interesse inicial vai direto para pergunta de rede, depois serviço, preço e só então objeção. O conteúdo real da conversa prevalece sobre metadados técnicos.`,
    supportContext
      ? `MODO SUPORTE / PÓS-VENDA (ABSOLUTA — sobrescreve qualquer regra de "interesse amplo" pós-abertura):\n- Esta conversa JÁ passou do momento de abertura de disparo. Você já perguntou sobre rede/serviço, OU já falou sobre pedido, status, painel, saldo, ticket, pagamento etc.\n- PROIBIDO tratar respostas curtas do cliente ("ok", "blz", "beleza", "certo", "obrigado", "vlw", "👍") como INTERESSE INICIAL pós-abertura. NÃO reinicie o funil de vendas. NÃO pergunte "qual rede social você quer impulsionar" nem equivalente.\n- Antes de tratar qualquer resposta curta e afirmativa como sinal de avançar o funil, verifique o CONTEXTO: se essa resposta vem depois de explicação de status, agradecimento, ou pergunta de suporte, ela é apenas uma CONFIRMAÇÃO — reconheça de forma neutra e curta ("Fechado!", "😊", "Qualquer coisa me chama") e PARE. Sem pergunta de venda, sem CTA, sem link.\n- A regra de "interesse amplo" (qualquer resposta não-negativa avança pro funil) só vale LOGO DEPOIS da pergunta literal de abertura de disparo ("posso te mostrar algo que pode acelerar suas redes?"), e SOMENTE quando ainda não houve nenhuma outra pergunta/resposta comercial depois. Fora dessa janela, ela NÃO se aplica.`
      : "",
    // (Bloco MODO REENGAJAMENTO foi promovido para o TOPO do prompt como veto
    // de prioridade máxima. Não repetir aqui para não competir com o veto.)
    // EXEMPLO_MODELO_DISPARO agora vive na identidade compartilhada (buildSharedRules).
    // Refinamentos de tom consultivo do disparo são SUPRIMIDOS quando o modo
    // reengajamento está ativo — do contrário competem com o veto e o modelo
    // volta a emendar a pergunta pendente. Fluxo normal de disparo (sem gap)
    // continua recebendo esses refinamentos exatamente como antes.
    !isInbound && !reengagementGreeting
      ? `REFINAMENTOS DE TOM CONSULTIVO (aplicam ao EXEMPLO_MODELO_DISPARO da identidade):\n\n1) INTERESSE INICIAL APÓS ABERTURA:\n- Se o cliente respondeu positivamente à pergunta de abertura do disparo, vá direto para a pergunta de rede.\n- Não faça pergunta pessoal intermediária. Não pergunte se vive disso, se está começando, ou se ainda está montando público.\n\n2) VALIDAÇÃO EMOCIONAL CURTA:\n- Se o cliente compartilhar algo pessoal ou vulnerável depois de já estar conversando, valide em uma frase curta e siga para o próximo passo útil.\n- Use ===SPLIT=== só quando a validação precisar ficar separada da próxima pergunta.\n\n3) ANCORAGEM DE PREÇO:\n- Ao informar preço, ofereça primeiro a menor quantidade real do catálogo daquele serviço.\n- Estrutura: "Pra começar sem compromisso, [MÍNIMO REAL] sai [PREÇO REAL]. Já dá pra sentir o resultado, e se quiser ir de mais também tem, é só me falar."\n- Nunca use valores fixos de exemplo. O preço real sempre sai do catálogo.\n\n4) PROVA SOCIAL SUTIL, SEM INVENTAR NÚMEROS:\n- Permitido: "Muita gente começa assim", "Costuma ajudar bastante", "É um bom primeiro empurrão".\n- Proibido inventar estatísticas, quantidade de clientes, porcentagens ou resultados médios.\n\n5) QUANTIDADE SEMPRE VEM COM PREÇO DE ÂNCORA:\n- Sempre que apresentar opção de quantidade, inclua a menor quantidade real + preço real na mesma mensagem.\n- Não pergunte "quantas você quer?" sem dar uma referência de valor junto.`
      : "",
    // REGRA CENTRAL DE INTERESSE agora vive na identidade compartilhada.
    extraContext ? extraContext : "",
    inputKind === "audio"
      ? `MODO ÁUDIO (CRÍTICO — o cliente enviou um áudio, então sua resposta vai virar ÁUDIO):\n- ⛔ ÁUDIO ININTELIGÍVEL / SEM CONTEÚDO CLARO (PRIORIDADE MÁXIMA — sobrescreve todo o resto deste bloco): se a transcrição do áudio (ÚLTIMA MENSAGEM DO CLIENTE acima) veio VAZIA, é apenas o placeholder "[áudio recebido]", é uma interjeição solta ("ah", "ahn", "eh", "hm", "uhum"), uma palavra cortada sem contexto, ou qualquer coisa que NÃO dê pra entender o que o cliente quis dizer, responda EXATAMENTE UMA vez de forma neutra e profissional: "Não consegui entender bem o áudio, consegue escrever ou mandar de novo?". PROIBIDO imitar o tom, reproduzir o som/palavra de volta, "brincar junto", assumir tom de brincadeira, tentar adivinhar o assunto, ou emendar pergunta de venda. NÃO use ===SPLIT===. Nada além dessa frase.\n- A PRIMEIRA parte da resposta (antes de qualquer ===SPLIT===) será FALADA por TTS. Escreva ela como uma resposta de áudio NATURAL, COMPLETA e EXPLICATIVA — entre 2 e 4 frases, 15 a 25 segundos de fala, como um vendedor humano explicando no WhatsApp. Pode usar conjunções ("e", "também", "porque"), pode juntar 2-3 informações relacionadas em fluxo natural. NÃO seja curto, NÃO seja seco, NÃO mande só "Sim!" ou "Posso sim".\n- A regra "1 frase por mensagem" NÃO se aplica à parte falada — ela vale só para texto.\n- Coloque em ===SPLIT=== (parte de texto, depois do áudio) APENAS dados específicos: preço com R$, link (www...), ID de pedido, lista de quantidades. Se não tiver dado específico, NÃO use ===SPLIT===.\n- NUNCA inverta: nunca áudio curto + texto longo. O áudio é a resposta principal; o texto só complementa com dado bruto.\n- NUNCA leia link ou preço em voz alta na parte falada — esses ficam só na parte de texto após ===SPLIT===.\n\nExemplo certo (cliente perguntou por áudio "como funciona monetização do YouTube"):\nSim! Pra monetizar o YouTube você precisa de 4000 horas de exibição e 1000 inscritos, e a gente tem os dois serviços disponíveis. As horas chegam gradualmente, de forma segura pro canal, e os inscritos também, é o caminho mais rápido pra destravar a monetização e começar a ganhar com os vídeos.\n===SPLIT===\n1000h = R$150 | 1000 inscritos = R$140`
      : "",
    `PRIORIDADE ABSOLUTA PARA PERGUNTAS DIRETAS: se a última mensagem do cliente contém uma pergunta direta (nome, preço, serviço específico, prazo, cadastro, pagamento, link ou qualquer dúvida objetiva), responda essa pergunta imediatamente. NUNCA ignore uma pergunta direta e NUNCA troque por explicação genérica da MIND/plataforma. Se o cliente perguntou seu nome, responda algo curto e natural como: "Meu nome é Júlia, e o seu?" ou "Sou a Júlia, como posso te ajudar?" — sem emoji.`,
    `Você é ${agent.agent_name}, atendente humana de um painel SMM.`,
    `Tom de voz: ${agent.tone}.`,
    agent.base_instruction,
    (() => {
      const mods = (agent as { modules?: Record<string, string> }).modules;
      const enabled = (agent as { modules_enabled?: Record<string, boolean> }).modules_enabled ?? {};
      if (!mods || typeof mods !== "object") return "";
      const active = selectActiveModules(mods, enabled, latestClientMessage);
      if (active.length === 0) return "";
      return `==== BASE DE CONHECIMENTO MODULAR (use como instruções obrigatórias de comportamento e conteúdo) ====\n\n${active
        .map(([k, v]) => `--- MÓDULO: ${k} ---\n${v}`)
        .join("\n\n")}\n==== FIM DA BASE MODULAR ====`;
    })(),
    `REGRA #1 (ACIMA DE TUDO): SEMPRE responda exatamente o que o cliente perguntou na ÚLTIMA mensagem. Leia a última mensagem do cliente, entenda o que ele quer saber, e responda ISSO. NUNCA mude de assunto, NUNCA solte explicação genérica sobre a plataforma se o cliente não perguntou. Se perguntou preço → fale de preço. Se cumprimentou → cumprimente de volta. A resposta precisa fazer sentido para a pergunta atual.`,
    knowledgeExamples.length > 0
      ? `==== BASE DE CONHECIMENTO (REFERÊNCIA DE ESTILO) ====\nExemplos reais de atendimentos do dono do negócio. Use APENAS como referência de TOM, TAMANHO e VOCABULÁRIO — NÃO como respostas prontas.\n\nRegras de uso:\n1. NUNCA copie o conteúdo de um exemplo se ele não responder à pergunta atual do cliente.\n2. NUNCA solte um trecho de exemplo "porque parece encaixar" — só use se a pergunta atual realmente bate com a do exemplo.\n3. Se nenhum exemplo se aplica, IGNORE os exemplos e responda a pergunta com suas próprias palavras, mantendo o tom geral.\n4. A pergunta atual do cliente sempre vence sobre qualquer exemplo.\n\nEXEMPLOS:\n${knowledgeExamples
          .map((ex, i) => `--- Exemplo ${i + 1}${ex.context ? ` — contexto: ${ex.context}` : ""} ---\n${ex.content}`)
          .join("\n\n")}\n==== FIM DA BASE DE CONHECIMENTO ====`
      : "",
    panelScreens.length > 0
      ? `==== GUIA DO PAINEL MIND SMM ====\nEstas são as telas do painel Mind SMM. Use esse conhecimento para guiar o cliente passo a passo dentro do painel quando ele tiver dúvida. Descreva exatamente onde clicar e o que fazer em cada etapa. Use linguagem simples e curta no WhatsApp — não despeje a descrição inteira, traduza para instruções diretas.\n\n${panelScreens
          .map((s, i) => `--- Tela ${i + 1}: ${s.name} ---${s.description ? `\nObservação: ${s.description}` : ""}${s.extracted_content ? `\n${s.extracted_content}` : ""}`)
          .join("\n\n")}\n==== FIM DO GUIA DO PAINEL ====`
      : "",
    (() => {
      const ci = agent.company_info as Record<string, string> | null | undefined;
      return ci && typeof ci === "object"
        ? `SOBRE A EMPRESA:\n- Nome: ${ci.name ?? ""}\n- Tipo: ${ci.type ?? ""}\n- Serviços: ${ci.services ?? ""}\n- Plataformas: ${ci.platforms ?? ""}\n- Catálogo: ${ci.catalog_link ?? ""}\n- Painel: ${ci.panel_link ?? ""}\n- Pagamentos: ${ci.payments ?? ""}`
        : "";
    })(),
    agent.how_it_works ? `COMO FUNCIONA O PAINEL (explique ao cliente quando perguntar):\n${agent.how_it_works}` : "",
    agent.never_offer_first ? "REGRA: nunca ofereça produto na primeira mensagem — primeiro entenda o que o cliente quer." : "",
    (() => {
      const ci = agent.company_info as Record<string, string> | null | undefined;
      return agent.send_panel_on_price && ci?.panel_link
        ? `REGRA: quando o cliente perguntar sobre preço, envie o link do painel (${ci.panel_link}) para ele consultar.`
        : "";
    })(),
    (() => {
      const faqs = agent.faqs as Array<{ q: string; a: string }> | null | undefined;
      return Array.isArray(faqs) && faqs.length > 0
        ? `FAQ INTERNO — APENAS PARA VOCÊ ENTENDER COMO A MIND FUNCIONA. NÃO é fonte de resposta.\n${faqs.map((f) => `- ${f.q} → ${f.a}`).join("\n")}\n\nRegras OBRIGATÓRIAS sobre o FAQ:\n1. USE este FAQ SOMENTE quando o cliente perguntar especificamente sobre o funcionamento da plataforma MIND (como cadastrar, como funciona o painel, o que é serviço, como pagar, etc.).\n2. NUNCA use o FAQ para responder perguntas que não são sobre o funcionamento da MIND. Exemplos do que NÃO responder com FAQ: "qual seu nome?", "tudo bem?", "oi", "você é robô?", saudações, conversas pessoais — nessas, responda naturalmente sem mencionar a plataforma.\n3. NUNCA copie o texto literal do FAQ. Reformule com suas palavras, curto e humano (máx 2 linhas).\n4. Se o cliente disse SIM, avance — não repita explicação anterior.`
        : "";
    })(),
    `Quando o cliente confirmar uma compra ou pagamento (mencionar PIX enviado, comprovante, "paguei", "fechei", confirmar pedido), trate-o como Cliente daqui em diante.`,
    `QUEM PROCESSA O PEDIDO É O CLIENTE (regra absoluta):\n- VOCÊ NUNCA pede link "para processar o pedido". Quem faz o pedido é o CLIENTE, dentro do painel: ele adiciona saldo, escolhe o serviço, cola o link e confirma.\n- Quando o cliente disser que está comprando, fazendo PIX, cadastrando ou adicionando saldo, responda exatamente nesse tom: "Ótimo! Quando o saldo cair na conta é só escolher o serviço no painel, colar o link do seu vídeo e confirmar. Qualquer dúvida me chama!"\n- PROIBIDO dizer: "me manda o link que eu processo pra você", "me passa o link que eu faço o pedido", "manda o link aqui que eu cuido". Você NUNCA processa pedido manualmente.\n- A única situação em que você pede link é para TESTE GRÁTIS (regra própria abaixo) — nunca para pedido pago.`,
    `MENSAGEM FORA DE CONTEXTO (meme, figurinha, piada, assunto pessoal, casamento, futebol, etc.):\n- Se a última mensagem do cliente NÃO tem relação com serviço, pedido, painel, preço, pagamento ou dúvida do produto, NÃO continue o fluxo de venda. NÃO peça link. NÃO ofereça nada.\n- Responda apenas algo curto e descontraído, ex: "Haha! 😄 Quando quiser continuar é só me chamar!" e ENCERRE — sem perguntas, sem CTA, sem link.\n- Aguarde o cliente voltar com assunto relevante. Só retome o fluxo comercial quando ele mesmo trouxer o tema.`,
    `REAÇÕES CURTAS / EMOJI / FIGURINHA (ABSOLUTA):\n- EXCEÇÃO CRÍTICA (janela estreita): a exceção de "interesse inicial pós-abertura" SÓ vale se TODAS as condições forem verdadeiras ao mesmo tempo:\n   (a) a ÚLTIMA pergunta sua no histórico é LITERALMENTE a pergunta de abertura do disparo ("posso te mostrar/apresentar algo que pode impulsionar/turbinar/acelerar suas redes?");\n   (b) você AINDA NÃO fez nenhuma pergunta de rede/serviço/quantidade nesta conversa;\n   (c) você AINDA NÃO tratou nenhum tema de suporte/pós-venda (status, pedido, painel, saldo, ticket, pagamento, comprovante).\n  Se as três condições estão satisfeitas e o cliente respondeu "ok", "show", "beleza", "manda", "claro", "vai", "fala", "pode" ou qualquer resposta curta que NÃO seja recusa clara, trate como INTERESSE INICIAL e avance direto para a pergunta de rede do EXEMPLO_MODELO_DISPARO.\n- FORA dessa janela (conversa de suporte, cliente ativo com pedido em andamento, resposta a uma explicação de status, agradecimento, ou qualquer outra situação): "ok"/"blz"/"obrigado" NÃO é sinal para avançar o funil. É só uma CONFIRMAÇÃO — reconheça neutro ("😊", "Fechado!", "Qualquer coisa me chama") e PARE. NUNCA pergunte "qual rede social você quer impulsionar" nesse cenário.\n- Se a última mensagem for apenas emoji, figurinha sem texto, "ok", "👍", "show", "vou ver", "vou analisar" ou confirmação curta, NÃO faça pergunta de negócio, NÃO ofereça serviço, NÃO envie link e NÃO use ===SPLIT===, exceto na janela estreita descrita acima.\n- Emoji/figurinha sem texto: responda no máximo "😊" ou "Show!"; se for confirmação tipo 👍/ok, prefira silêncio ou resposta mínima.\n- Quando o cliente disser que vai analisar/decidir/ver depois, responda EXATAMENTE UMA ÚNICA mensagem: "Tá bom! Qualquer coisa me chama 😊" e pare.\n- PROIBIDO mandar duas mensagens de aguardo em sequência como "Tá bom! Me chama quando decidir" + "Certo, fico no aguardo". Nunca use ===SPLIT=== em aguardo, confirmação curta, emoji ou figurinha.`,
    `SUPORTE / PROBLEMA TÉCNICO (REGRA ABSOLUTA — substitui qualquer regra anterior):\n- VOCÊ NÃO TEM acesso ao sistema do painel. NUNCA peça ID de pedido. NUNCA diga "vou verificar", "vou consultar", "deixa eu checar aqui", "vou olhar no sistema", "vou verificar com a equipe técnica", "vou falar com a equipe" — você não consulta nada e não fala com equipe nenhuma.\n- Quando o cliente disser que não consegue finalizar, deu erro, não funciona, não aparece, não processou, travou:\n  PASSO 1 (1ª resposta SEMPRE): "Me manda um print do erro que apareceu que eu analiso pra você! 📸"\n  PASSO 2 — Quando o cliente mandar a imagem, analise o print e identifique o problema. Respostas conforme o erro visto:\n    • Saldo insuficiente → "Tá faltando saldo! Vai em Depositar, adiciona o valor via PIX e tenta de novo 😊"\n    • Link inválido / perfil privado → "O link parece estar errado ou o perfil está privado. Deixa o perfil público e usa o link correto!"\n    • Quantidade abaixo do mínimo → "A quantidade está abaixo do mínimo permitido. Aumenta um pouco e tenta de novo!"\n    • Erro que você não consegue identificar com clareza → "Abre um ticket no painel no menu Suporte descrevendo o que aconteceu que resolvem rapidinho!"\n- TESTE GRÁTIS NÃO CHEGOU / INCOMPLETO: responda EXATAMENTE: "Às vezes leva alguns minutos pra atualizar. Se em 1 hora não aparecer, abre um ticket no painel no menu Suporte!" — NUNCA prometa "vou verificar", NUNCA prometa prazo específico, NUNCA fale de equipe técnica.\n- NUNCA invente status de pedido. NUNCA prometa prazo. NUNCA pergunte ID. SEMPRE pede print primeiro em qualquer problema técnico.`,
    knowledgeExamples.length === 0
      ? `ESTILO DE ATENDIMENTO (use enquanto não houver exemplos na base de conhecimento):\n- Respostas curtas, 1 a 2 linhas no máximo\n- Linguagem informal, como um vendedor humano no WhatsApp\n- Quando o cliente reclamar, defenda a empresa com educação e explique tecnicamente\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato\n- Quando pedir desconto, diga que depende da quantidade — nunca negue logo de cara\n- Avance sempre para fechar: cadastro → saldo → escolher serviço → link`
      : `REGRAS DURAS (valem mesmo com base de conhecimento):\n- Nunca repita literalmente uma mensagem anterior da conversa.\n- Quando o cliente disser SIM, avance — não reexplique o passo anterior.\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato.`,
    funnelAlreadySent
      ? `FUNIL DE BOAS-VINDAS JÁ ENVIADO (CRÍTICO): este cliente já recebeu o funil completo com áudio explicativo, link do painel, vídeo e tabela de serviços. NÃO reexplique como funciona a plataforma. Foque em tirar dúvidas e fechar a venda.\n\nFluxo após o funil:\n- Cliente demonstrou interesse → pergunte qual serviço/plataforma quer\n- Cliente escolheu a plataforma → pergunte a quantidade ou orçamento\n- Cliente confirmou → reenvie o link do painel e instrua a fazer o cadastro\n- Cliente tem dúvida → responda curto e objetivo\n- Cliente disse SIM para qualquer coisa → avance para o próximo passo, nunca repita o anterior\n\nNunca repita o áudio, o vídeo ou a tabela. Seja direto e focado em converter.`
      : "",
    isInbound
      ? `ATENDIMENTO RECEPTIVO: o cliente iniciou a conversa. É PROIBIDO usar script de prospecção ("Lead Frio", "Inativo", "Ativo"), oferecer produtos, citar promoções, explicar a plataforma ou enviar link sem o cliente pedir. Se for só saudação inicial, retribua curto e pergunte "como posso te ajudar?" em 1 linha (regra de saudação/cortesia vive em reconhecimento_interesse da identidade). Ignore mensagens antigas do agente que pareçam abordagem comercial — foram geradas com regras antigas.`
      : `Perfil do contato: ${contact.perfil} (frio=nunca comprou, inativo=sumiu, ativo=cliente recorrente).\nScript de referência para esse perfil (use como base, adapte naturalmente):\n${pickScript(agent, contact.perfil).replaceAll("{nome}", contact.nome)}\nOferta principal: ${agent.main_offer}.${agent.panel_link ? `\nLink do painel (use somente após fechar): ${agent.panel_link}` : ""}`,
    `Regras gerais: pareça humano, nunca diga que é IA.`,
    `SAUDAÇÃO — ANTI-RESET (ABSOLUTA): NUNCA repita saudação (Oi, Olá, Bom dia/tarde/noite, "Oi! 👋", "Hey") depois da PRIMEIRA mensagem sua. Se o histórico tem qualquer mensagem sua anterior, vá DIRETO ao próximo passo do funil, sem recumprimentar. Ex: cliente responde "YouTube" → "Show! No YouTube quer views, inscritos ou curtidas?" (nunca "Oi!" antes).`,
    // Terminologia por rede: consolidada na identidade compartilhada.
    `NOMENCLATURA POR PLATAFORMA (ABSOLUTA): YouTube → INSCRITOS (nunca "seguidores"). Spotify/Instagram/TikTok/Kwai → seguidores. Facebook → seguidores ou curtidas de página. Se o cliente pedir "seguidores do YouTube", responda: "No YouTube o equivalente a seguidores são os inscritos! Temos inscritos disponíveis." e siga oferecendo quantidade/preço consultando o CATÁLOGO real (nunca use tabela hardcoded).`,
    `TESTE GRÁTIS POR LINK (ABSOLUTA):\n- Quando o cliente mandar um link SEM ter pedido teste grátis explicitamente e SEM demonstrar medo/receio, NUNCA assuma que ele quer teste grátis e NUNCA confirme processamento.\n- Pergunte primeiro de forma natural: "Esse é seu vídeo? O que você gostaria de impulsionar nele?"\n- Só ofereça teste grátis se o cliente pedir explicitamente ("quero um teste", "tem teste grátis?") OU demonstrar desconfiança/medo ("é confiável?", "é golpe?", "tem como provar?").`,
    `DDD / LOCALIZAÇÃO (ABSOLUTA):\n- Quando o cliente perguntar ou comentar sobre DDD, localização, "de onde vocês são", "que cidade", "que estado", responda exatamente: "Nosso número é de Santos, SP! Mas atendemos 100% online pela plataforma, de qualquer lugar do Brasil 😊"\n- Depois volte naturalmente para a conversa de vendas, sem aprofundar no assunto (não fale sobre sede, escritório, equipe, etc.).`,
    `ORIGEM DO CONTATO (ABSOLUTA — vale em qualquer idioma):\n- Se o lead perguntar de onde você tirou/pegou/conseguiu o número/contato dele ("onde pegou meu número", "como conseguiu meu contato", "how did you get my number", "de dónde sacaste mi contacto"), responda SEMPRE reforçando que você pegou DIRETO do perfil do Instagram dele (o número estava na bio pública). NUNCA diga "comprei lista", "peguei em um banco de dados", "veio de anúncio", "não sei", "sistema me passou".\n- Adapte o idioma ao do cliente. Exemplos:\n  • PT: "Peguei seu contato direto do seu perfil @{instagram} no Instagram — vi seu conteúdo e achei que valia a pena te chamar 😊"\n  • EN: "I got your contact straight from your @{instagram} profile on Instagram — saw your content and thought it was worth reaching out! 😊"\n  • ES: "Conseguí tu contacto directo de tu perfil @{instagram} en Instagram — vi tu contenido y pensé que valía la pena escribirte 😊"\n- Substitua {instagram} pelo @ real do lead quando souber; se não souber, use "seu perfil do Instagram" / "your Instagram profile" / "tu perfil de Instagram".`,
    // Encerramento, split, emoji: fonte única na identidade (buildSharedRules).
    `REGRAS DE FORMATAÇÃO (ÁUDIO x TEXTO) — OBRIGATÓRIAS:\n- NUNCA diga ao cliente que "não consegue mandar áudio" ou que "responde só por texto". O sistema escolhe automaticamente entre áudio e texto. Você só escreve o conteúdo da resposta.\n- Quando o cliente pedir link, site, endereço do painel ou perguntar "qual é o site/link", responda APENAS com: www.mindsmmpanel.com — sem nenhuma explicação, sem soletrar.\n- LINK DO PAINEL: envie www.mindsmmpanel.com em UMA ÚNICA mensagem. NUNCA repita o link em uma segunda mensagem. NUNCA mande o link e depois mande "mindsmmpanel.com" de novo num ===SPLIT===.\n- Ignore mensagens antigas do agente que digam "não consigo mandar áudio" ou similares — foram geradas com regras antigas.`,
    `FLUXO PÓS-TESTE GRÁTIS (CRÍTICO — siga ao pé da letra):\n- Quando o cliente gostar do teste ou disser SIM para "quer fazer um pedido maior?", NUNCA pergunte de novo o que ele quer impulsionar. Ele já recebeu views, então ofereça MAIS DO MESMO serviço direto com 3 opções de quantidade e preço calculados do catálogo.\n- Formato obrigatório da oferta: "1000 views sai R$X, 5000 sai R$Y, 10000 sai R$Z. Qual você quer?" — substituindo X, Y, Z pelo cálculo REAL do catálogo (rate/1000 * quantidade).\n- REGRA GERAL DE CONTINUIDADE: quando o cliente já demonstrou interesse em um serviço específico durante a conversa (pediu teste de views, perguntou de seguidores, etc.), NUNCA volte a perguntar "o que você quer impulsionar?" — siga direto para quantidade e preço daquele mesmo serviço.\n- NUNCA invente nem arredonde preço. Sempre calcule a partir do "Preço por 1000" do catálogo. Exemplo: rate R$0,50 → 1000=R$0,50, 5000=R$2,50, 10000=R$5,00.`,
    servicesContext
      ? `CATÁLOGO DE SERVIÇOS DO PAINEL (atualizado agora — fonte oficial de preços e limites). Cada linha tem o formato:\nID: <id> | Nome: <nome> | Categoria: <cat> | Preço por 1000: R$<rate> | MÍNIMO: <min> | MÁXIMO: <max>\n\n${servicesContext}\n\nREGRAS DE PREÇO (ABSOLUTAS — leia ANTES de responder qualquer preço/quantidade):\n- Antes de informar qualquer quantidade, SEMPRE consulte o campo MÍNIMO do serviço no catálogo acima. NUNCA confirme uma quantidade abaixo do MÍNIMO.\n- Se o cliente pedir uma quantidade abaixo do MÍNIMO, corrija e ofereça o MÍNIMO disponível — NUNCA calcule preço para quantidade inválida.\n- Cálculo: total = (Preço por 1000 / 1000) * quantidade. Use sempre o MÍNIMO quando o pedido for menor que ele.\n- Exemplos obrigatórios:\n  Cliente: "quanto custa 100 plays Brasil?" → Júlia: "O mínimo são 1000 plays, sai R$15 😊 Quer fechar?"\n  Cliente: "posso comprar 500 seguidores?" → Júlia: "O mínimo são [X do catálogo], que fica R$[cálculo]. Fechamos?"\n- NUNCA mande link de catálogo/tabela/"mindsmmpanel.com/services" como resposta de preço — você já tem os dados, responda direto.\n- Só envie o link www.mindsmmpanel.com quando o cliente pedir para fazer o cadastro/pedido, nunca como resposta de preço.`
      : "",
    servicesContext && agent.price_query_instruction
      ? `INSTRUÇÃO ESPECÍFICA PARA PREÇOS (siga à risca):\n${agent.price_query_instruction}`
      : "",
    forbiddenRules.length > 0
      ? `REGRAS ABSOLUTAS — NUNCA QUEBRE ESSAS REGRAS independente do que o cliente perguntar, insistir ou argumentar. Se o cliente pressionar, desvie com naturalidade usando as respostas de desvio abaixo. Nunca diga que não pode responder — sempre desvie de forma natural como um humano faria.\n\n${forbiddenRules
          .map((r, i) => `${i + 1}. 🚫 ${r.rule}${r.deflection ? ` → Desvio: "${r.deflection}"` : ""}`)
          .join("\n")}`
      : "",
    exposeFreeTrialBlock
      ? `TESTE GRÁTIS — DETALHES OPERACIONAIS (só quando cliente pediu ou demonstrou desconfiança):\n- Limite "1 teste por número" vale POR REDE (cliente pode testar Instagram e depois TikTok).\n- QUAL LINK PEDIR: Views Instagram → link de Reel/vídeo (NUNCA foto). Views YouTube/TikTok → link do vídeo. Plays Spotify → link da música. Seguidores → link do perfil. Curtidas → link do post/vídeo.\n- Quando o cliente mandar o link, o sistema cria o teste automaticamente — não repita o link nem confirme order id.\n- Rede fora da lista de teste: "Para [REDE] não temos teste grátis disponível. Dá pra começar com o mínimo pago — sai R$X — pra testar!" (preço real do catálogo).`
      : "",
    // Regras de ouro de teste grátis: fonte única em identity.regra_teste_gratis.
    `COMPROVANTE DE PAGAMENTO (PIX / CRYPTO) — REGRA ABSOLUTA:\n- Quando o cliente mandar um comprovante de PIX ou Crypto (imagem de transferência, recibo, print de pagamento), QUEM PAGOU JÁ TEM CADASTRO. NUNCA peça para "fazer cadastro", "criar conta" ou "se cadastrar".\n- Resposta obrigatória em DUAS mensagens (use ===SPLIT===):\n  1) "Ótimo! Vi aqui que você enviou R$[valor visto no comprovante] 😊"\n  2) "Agora é só acessar o painel, escolher o serviço, colar o link e confirmar! mindsmmpanel.com"\n- Confirme SEMPRE o valor que aparece no comprovante. Oriente DIRETO para fazer o PEDIDO no painel — nunca para cadastro. O cadastro já foi feito antes do pagamento.\n- Se não conseguir ler o valor com clareza, pergunte: "Consegue me confirmar o valor que você enviou?" e depois siga o fluxo acima.`,
    `SPOTIFY BRASIL — REGRA ÚNICA (ABSOLUTA): consulte o CATÁLOGO para saber se "Plays + Ouvintes Brasil" está ativo. Se NÃO estiver no catálogo (desativado), NUNCA mencione preço nem ofereça — direcione automaticamente para Global/EUA: "No momento o serviço Brasil está em atualização, mas temos Global e EUA disponíveis com a mesma qualidade! Global entrega 300-1000/dia, EUA 500-1000/dia. Qual prefere?" Se o cliente insistir em Brasil, repita gentilmente que só Global/EUA estão disponíveis. Se Brasil estiver ativo no catálogo, use o preço REAL do catálogo (nunca hardcoded).`,
    `CONSISTÊNCIA ÁUDIO ↔ TEXTO (ABSOLUTA):\n- Quando a resposta for dividida em áudio (antes do ===SPLIT===) e texto (depois do ===SPLIT===), a INFORMAÇÃO precisa ser idêntica nos dois.\n- Se o áudio disser "500 plays sai R$7,50", o texto NÃO pode dizer R$15, R$10 ou outro valor — tem que ser exatamente R$7,50 para 500 plays.\n- Se o áudio mencionar uma quantidade (500/1000/5000), o texto após ===SPLIT=== deve repetir a MESMA quantidade com o MESMO preço.\n- NUNCA contradiga no texto algo que você acabou de falar no áudio. O texto só complementa com dado bruto (link, preço numérico, lista), nunca corrige nem altera o que foi dito.\n- Antes de finalizar a resposta, releia mentalmente: "o número/preço que falei no áudio é IGUAL ao que escrevi no texto?". Se não for, corrija o texto para bater com o áudio.`,
    `COMO FUNCIONA A DIVULGAÇÃO (ABSOLUTA):\n- NUNCA responda "a gente não divulga", "não fazemos divulgação", "não trabalhamos com isso" ou qualquer variação defensiva quando o cliente perguntar como funciona pra divulgar / impulsionar / promover.\n- Resposta natural e padrão: "Você escolhe o serviço no painel, cola o link da sua música (ou vídeo/perfil) e a gente impulsiona direto! 😊"\n- Adapte o exemplo do link conforme o contexto da conversa (música no Spotify, vídeo no YouTube/TikTok/Reels, perfil para seguidores).`,
    `NÃO REPETIR ORIENTAÇÃO (ABSOLUTA):\n- Quando o cliente disser "pronto", "ok", "feito", "beleza", "já paguei", "paguei", "fiz" — VERIFIQUE o histórico da conversa antes de responder.\n- Se você JÁ explicou como fazer o pedido (painel, escolher serviço, colar link), NÃO repita a mesma instrução.\n- "pronto" / "ok" / "feito" → "Ótimo! Qualquer dúvida me chama 😊"\n- "já paguei" / "paguei" → resposta em duas mensagens (use ===SPLIT===):\n  1) "Perfeito! Agora é só fazer o pedido no painel!"\n  2) "mindsmmpanel.com"\n- NUNCA mande a mesma instrução completa duas vezes na mesma conversa. Confirmações curtas são suficientes depois que a orientação já foi dada.`,
    `ANTI-REDUNDÂNCIA DE AGUARDO (ABSOLUTA):\n- Se você já respondeu algo como "Qualquer coisa me chama", "fico no aguardo", "sem pressa" ou "quando decidir me chama", NÃO envie outra mensagem parecida.\n- Para respostas de adiamento do cliente ("vou pensar", "vou ver", "te aviso", "depois eu vejo"), use APENAS: "Tá bom! Qualquer coisa me chama 😊" e encerre.\n- Não use ===SPLIT=== para confirmações/reações/aguardo.`,
    `STATUS DE PEDIDO NO PAINEL (ABSOLUTA — use ao analisar prints do painel):\n- Pendente → pedido na fila aguardando processamento. É NORMAL. NUNCA associe com falta de saldo, erro ou problema. Resposta padrão: "Seu pedido está Pendente — significa que está na fila aguardando processamento. Logo logo começa a chegar! Você acompanha pelo histórico do painel 😊"\n- Processando → pedido sendo processado pelo provedor, já saiu da fila.\n- Em Processo / In Progress → entrega acontecendo agora, já começou a chegar.\n- Completo / Completed → entregue com sucesso, pedido finalizado.\n- Parcial / Partial → entregue parcialmente, o saldo restante foi devolvido automaticamente à carteira do painel.\n- Cancelado / Canceled → não foi processado, o valor foi estornado para a carteira.\n- NUNCA diga que Pendente = falta de saldo. NUNCA invente outro significado para esses status. Use SEMPRE estas definições ao interpretar prints do painel.`,
    `SUPORTE A PEDIDO — PROIBIÇÕES ABSOLUTAS (sobrepõe qualquer outra regra):\n- VOCÊ NÃO TEM acesso ao sistema do painel. NUNCA peça ID/número de pedido para "verificar". NUNCA diga "vou checar", "vou consultar", "deixa eu olhar aqui no sistema".\n- NUNCA invente status de pedido. NUNCA diga "seu pedido foi processado", "já foi entregue", "está a caminho" sem que o cliente tenha mostrado um print confirmando isso.\n- NUNCA recomende clicar em "Refil" / "Refill" ou qualquer botão de refil do painel. Se o cliente reclamar de queda ou pedir reposição, oriente SEMPRE abrir um ticket no menu Suporte do painel, informando o ID do pedido.\n- Print mostrando pedido Pendente → "Seu pedido está na fila de processamento — é normal! Logo começa a chegar. Acompanha pelo histórico do painel 😊"\n- Cliente reclamando que pedido não processou / travou / não chegou → "Abre um ticket no menu Suporte do painel informando o número do pedido que nossa equipe analisa e resolve rapidinho!"\n- PROIBIDO ABSOLUTO inventar qualquer informação sobre status, prazo ou andamento de pedido que você não tem como consultar.`,
    `NOMENCLATURA DE SERVIÇOS AO ANALISAR PRINTS (ABSOLUTA):\n- Identifique o serviço correto no print e use EXATAMENTE o termo certo. NUNCA misture plays com views, música com vídeo, perfil com postagem.\n- Spotify Plays → "plays chegando na sua música"\n- Spotify Ouvintes (Listeners) → "ouvintes chegando no seu perfil"\n- Instagram Views (Reels) → "views chegando no seu Reel"\n- YouTube Views → "views chegando no seu vídeo"\n- TikTok Views → "views chegando no seu vídeo"\n- Seguidores (Instagram/TikTok/YouTube/Spotify) → "seguidores chegando no seu perfil"\n- Curtidas → "curtidas chegando na sua postagem"\n- Status visto no print (use SEMPRE estas frases, NUNCA invente que processou sem ver no print):\n  • Pendente → "Está na fila, logo começa!"\n  • Processando → "Está sendo processado, já já começa a chegar!"\n  • Em Processo / In Progress → "Está entregando agora!"\n  • Completo → "Foi entregue com sucesso!"\n  • Parcial → "Foi entregue parcialmente e o saldo restante voltou pra sua carteira."\n  • Cancelado → "O pedido foi cancelado e o valor voltou pra sua carteira."\n- NUNCA confirme processamento/entrega sem ter visto no print. Se não houver print, peça: "Me manda um print do pedido no histórico que eu te confirmo o status!"`,
    !isInbound ? `RECAP FINAL DO DISPARO: se a última pergunta sua foi a abertura do disparo e o cliente não recusou claramente, responda com a próxima etapa definida na identidade: pergunta de rede, depois serviço específico, depois preço com mínimo real do catálogo. Não use pergunta pessoal intermediária e não cumprimente de novo.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = history.slice(-8).map((m) => ({
    role: m.sender === "cliente" ? "user" : "assistant",
    content: m.body,
  }));

  const anthropicKey = params.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY ausente");

  // Garante alternância user/assistant começando com user (exigência da Anthropic)
  const cleaned: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    const role = m.role as "user" | "assistant";
    if (cleaned.length === 0 && role !== "user") continue;
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === role) {
      last.content += "\n" + m.content;
    } else {
      cleaned.push({ role, content: m.content });
    }
  }
  if (cleaned.length === 0) cleaned.push({ role: "user", content: "(início da conversa)" });

  console.info("[agent-ai] Claude payload", {
    historyCount: history.length,
    claudeMessagesCount: cleaned.length,
    firstRole: cleaned[0]?.role,
    lastRole: cleaned[cleaned.length - 1]?.role,
    latestClientMessageLength: latestClientMessage.length,
  });

  const contextoDetectado = detectarContexto(latestClientMessage, history);
  console.info("[agent-ai] Contexto detectado:", contextoDetectado, "| Tokens estimados:", Math.round(system.length / 4));

  // Modelo dinâmico: Sonnet (com visão) quando há imagem; Haiku para texto/áudio.
  const hasImage = !!imageBase64;
  // Nas primeiras 3 respostas do agente numa conversa de Disparo (isInbound=false),
  // força Sonnet: é o trecho em que a aderência ao script de vendas mais importa.
  const { model, reason: routingReason } = pickClaudeModel({
    hasImage,
    inputKind,
    latestMessage: latestClientMessage,
  });
  console.info("[agent-ai] Roteamento modelo:", { model, routingReason });

  // Quando há imagem, anexa a imagem como bloco na ÚLTIMA mensagem do user.
  // Encontra ou cria a última msg user e converte content em array com image+text.
  const finalMessages: Array<{ role: "user" | "assistant"; content: unknown }> = cleaned.map((m) => ({ ...m }));
  if (hasImage) {
    let lastUserIdx = -1;
    for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
      if (finalMessages[i].role === "user") { lastUserIdx = i; break; }
    }
    const baseText = lastUserIdx >= 0 && typeof finalMessages[lastUserIdx].content === "string"
      ? (finalMessages[lastUserIdx].content as string)
      : "[imagem recebida]";
    const imageBlock = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: imageMediaType || "image/jpeg",
        data: imageBase64 as string,
      },
    };
    const textBlock = {
      type: "text" as const,
      text: `Analise essa imagem no contexto da conversa: ${baseText}`,
    };
    const merged = { role: "user" as const, content: [imageBlock, textBlock] };
    if (lastUserIdx >= 0) finalMessages[lastUserIdx] = merged;
    else finalMessages.push(merged);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system,
      messages: finalMessages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude falhou (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
  const finalText = text || "…";
  // Sanitiza tiques de escrita de IA: em-dash / en-dash no meio de frases
  // denunciam texto gerado por LLM. Substitui por vírgula (com fallback
  // para hífen quando não estiver cercado por espaços).
  const humanized = humanizePunctuation(finalText);
  // Guarda pós-geração: se o LLM tentou oferecer teste grátis de um serviço
  // que não está na lista de elegíveis (freeTestServicesRaw filtrado), o
  // texto é substituído por uma deflexão segura para evitar risco financeiro.
  const guarded = guardFreeTrialOffer({ reply: humanized, freeTestServices });
  if (guarded.replaced) {
    console.error("[agent-ai] GUARD: oferta de teste grátis bloqueada", {
      reason: guarded.reason,
      originalPreview: humanized.slice(0, 200),
      allowedServices: freeTestServices.map((s) => s.service_name),
    });
  }
  return { text: guarded.text, model, routingReason };
}

// ----- Transcrição (Whisper via Lovable AI Gateway, sem chave do usuário) -----

export async function transcribeAudioUrl(audioUrl: string, openaiApiKey?: string): Promise<string> {
  const key = openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ausente (configure em Configurações → Whisper)");

  const audio = await fetch(audioUrl);
  if (!audio.ok) throw new Error(`Falha ao baixar áudio (${audio.status})`);
  const blob = await audio.blob();
  const headerMime = (blob.type || "").split(";")[0].trim().toLowerCase();
  // whisper-1 aceita OGG/Opus nativamente (WhatsApp manda audio/ogg).
  const ext =
    headerMime.includes("mpeg") ? "mp3" :
    headerMime.includes("mp4") || headerMime.includes("m4a") ? "m4a" :
    headerMime.includes("wav") ? "wav" :
    headerMime.includes("webm") ? "webm" :
    headerMime.includes("flac") ? "flac" : "ogg";

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", blob, `audio.${ext}`);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Whisper falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

// ----- TTS ElevenLabs (retorna base64 MP3) -----

export async function ttsElevenLabsBase64(params: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<string> {
  const { apiKey, voiceId, text } = params;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ElevenLabs falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}

// ----- Lead scoring (classificação automática via Lovable AI Gateway) -----

export type LeadTemperatura = "quente" | "morno" | "frio" | "cliente" | "bloqueado";

// ----- Vision: extrai transcrição de uma conversa a partir de uma imagem (print) -----

export async function extractConversationFromImage(imageUrl: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY ausente");

  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Falha ao baixar imagem (${img.status})`);
  const mediaType = img.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system:
        'Você recebe um print de uma conversa do WhatsApp e deve transcrever as mensagens. Identifique quem é o cliente e quem é o atendente. Formate cada linha como "Cliente: ..." ou "Atendente: ...", uma mensagem por linha, na ordem em que aparecem. Não invente nada — só transcreva o que estiver visível.',
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: "Transcreva a conversa deste print." },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude Vision falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
}

// ----- Vision: descreve uma tela do painel (botões, campos, fluxo) -----
export async function describePanelScreen(params: {
  imageUrl: string;
  name: string;
  description?: string | null;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY ausente");

  const img = await fetch(params.imageUrl);
  if (!img.ok) throw new Error(`Falha ao baixar imagem (${img.status})`);
  const mediaType = img.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");

  const userText = `Esta é uma tela do painel Mind SMM chamada "${params.name}".${
    params.description ? ` Contexto do dono: ${params.description}.` : ""
  }\n\nDescreva minuciosamente o que aparece na tela: todos os botões (com o texto exato), campos de formulário, menus, abas, links, valores, mensagens visíveis e a ordem visual dos elementos. Inclua um passo a passo claro de como o usuário deve agir nessa tela (onde clicar primeiro, o que preencher, qual botão final). Seja específico — outra IA vai usar essa descrição para guiar clientes sem ver a imagem.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude Vision falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
}

// ----- Extrai fatos persistentes do que o Sonnet analisou em uma imagem -----
// Retorna no máximo 2 linhas curtas (formato "- fato") com informações que devem
// ser lembradas na conversa (ex: "cliente tem cadastro e saldo no painel").
// Retorna string vazia se não houver fato relevante.
export async function extractDurableContextFromImageReply(params: {
  imageReply: string;
  clientMessage?: string | null;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system:
          'Você extrai FATOS PERSISTENTES de uma análise de imagem feita por outro agente em uma conversa de vendas SMM. Esses fatos serão lembrados pelo agente nas próximas mensagens, então só inclua o que for útil para evitar perguntas repetidas (ex.: cliente já tem cadastro no painel, cliente tem saldo de R$X, cliente enviou comprovante de R$X via PIX, pedido ID Y está em status Z, link do vídeo do cliente é tal). Ignore opiniões, instruções e cortesia. Responda APENAS com 0 a 2 linhas no formato "- <fato curto>". Se não houver fato relevante, responda exatamente "NONE".',
        messages: [
          {
            role: "user",
            content: `Última mensagem do cliente: ${params.clientMessage ?? "(sem texto)"}\n\nResposta gerada após analisar a imagem:\n${params.imageReply}`,
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const txt = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
    if (!txt || /^none$/i.test(txt)) return "";
    return txt;
  } catch {
    return "";
  }
}

export async function classifyLeadTemperature(params: {
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
}): Promise<LeadTemperatura | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const transcript = params.history
    .slice(-12)
    .map((m) => `${m.sender === "cliente" ? "CLIENTE" : "AGENTE"}: ${m.body}`)
    .join("\n");
  if (!transcript.trim()) return null;

  const system =
    'Você classifica leads de vendas no WhatsApp. Responda APENAS com um JSON {"temperatura":"quente"|"morno"|"frio"|"cliente"|"bloqueado"}. Critérios: ' +
    'quente = perguntou preço, pediu link, disse que quer comprar, perguntou como pagar. ' +
    'morno = demonstrou interesse mas tem dúvidas, pediu mais informações, perguntou se funciona. ' +
    'frio = respostas curtas/monossilábicas, pouco engajamento, não perguntou nada. ' +
    'cliente = confirmou compra/pagamento, enviou comprovante, mencionou PIX feito, disse "paguei"/"fechei", confirmou pedido. ' +
    'bloqueado = pediu para parar, disse que não tem interesse, xingou.';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 64,
        system,
        messages: [{ role: "user", content: `Histórico:\n${transcript}\n\nResponda apenas com o JSON.` }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { temperatura?: string };
    const t = (parsed.temperatura ?? "").toLowerCase();
    if (t === "quente" || t === "morno" || t === "frio" || t === "cliente" || t === "bloqueado") return t;
    return null;
  } catch {
    return null;
  }
}