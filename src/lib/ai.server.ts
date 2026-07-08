// Server-only Claude (Anthropic) call to generate the agent reply.
import { buildSharedRules, DEFAULT_IDENTITY, loadAgentIdentity, loadBrandBlocks, mergeIdentity, type AgentBrandBlocks } from "@/lib/agent-identity.server";
import { DEFAULT_MODULES } from "@/lib/agent-modules";
import { selectRelevantKnowledge } from "@/lib/kb-relevance";

// ETAPA 4 — FAQ sob demanda. Reaproveita o scoring keyword-based do KB
// (mesma taxonomia de tópicos + overlap de tokens). Trata a pergunta da
// FAQ como "context" e a resposta como "content" (é onde o vocabulário
// específico costuma estar). Cap default 5 FAQs (mais que isso vira ruído).
export function selectRelevantFaqs(
  faqs: Array<{ q: string; a: string }>,
  latestClientMessage: string,
  max = 5,
): Array<{ q: string; a: string }> {
  if (!Array.isArray(faqs) || faqs.length === 0) return [];
  const rows = faqs.map((f) => ({ context: f.q, content: `${f.q}\n${f.a}` }));
  const sel = selectRelevantKnowledge(rows, latestClientMessage, { max });
  if (sel.selected.length === 0) return [];
  // Reconstroi ordem preservada + mapeia de volta pro par original.
  const selectedQuestions = new Set(sel.selected.map((r) => r.context));
  return faqs.filter((f) => selectedQuestions.has(f.q)).slice(0, max);
}

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

// Detecta qual saudação retributiva usar em MODO REENGAJAMENTO.
// Prioriza a saudação que o cliente usou na última mensagem ("Boa tarde" →
// "Boa tarde!"). Se o cliente usou algo genérico ("oi", "olá", "tudo bem"),
// escolhe pelo período do dia atual. Retorna a saudação SEM pontuação final.
export function pickReengagementGreeting(
  latestClientMsg: string,
  nowDate: Date = new Date(),
): string {
  const s = (latestClientMsg ?? "").toLowerCase();
  if (/\bbom\s*dia\b/.test(s)) return "Bom dia";
  if (/\bboa\s*tarde\b/.test(s)) return "Boa tarde";
  if (/\bboa\s*noite\b/.test(s)) return "Boa noite";
  // Fallback pelo horário local do servidor (BR/UTC-3 aproximado).
  const hourBr = (nowDate.getUTCHours() - 3 + 24) % 24;
  if (hourBr >= 5 && hourBr < 12) return "Bom dia";
  if (hourBr >= 12 && hourBr < 18) return "Boa tarde";
  return "Boa noite";
}

// GUARD FINAL do MODO REENGAJAMENTO: se por qualquer motivo o LLM omitiu a
// saudação de volta como primeiras palavras ("Como posso ajudar?" cru), este
// guard prepende a saudação correspondente à do cliente. Determinístico e
// testável — pega a regressão antes de chegar em produção.
const REENG_GREETING_START_RX =
  /^\s*(bom\s*dia|boa\s*tarde|boa\s*noite|oi+|ol[aá]+|opa|eae|e\s*a[ií]|hey|hi|hello)\b/i;

export function enforceReengagementGreeting(
  text: string,
  latestClientMsg: string,
  nowDate: Date = new Date(),
): { text: string; prepended: boolean } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { text: trimmed, prepended: false };
  if (REENG_GREETING_START_RX.test(trimmed)) return { text: trimmed, prepended: false };
  const greeting = pickReengagementGreeting(latestClientMsg, nowDate);
  return { text: `${greeting}! ${trimmed}`, prepended: true };
}

export function isReengagementGreeting(history: Msg[], nowIso?: string): boolean {
  if (!history?.length) return false;
  // Última mensagem da agente
  let lastAgentIdx = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].sender === "agente" && history[i].body?.trim()) {
      lastAgentIdx = i;
      break;
    }
  }
  if (lastAgentIdx < 0) return false;
  // TODAS as mensagens do cliente depois da última do agente. Precisa haver
  // ao menos uma, e TODAS elas têm que ser saudação curta pura. Se qualquer
  // uma tiver conteúdo real (ex.: cliente mandou "Boa noite" + "poderia me
  // passar informações?" em burst), NÃO é reengajamento — o modelo tem que
  // responder à pergunta real, não aplicar o template genérico.
  const clientMsgsAfter: Msg[] = [];
  for (let i = lastAgentIdx + 1; i < history.length; i += 1) {
    if (history[i].sender === "cliente" && history[i].body?.trim()) {
      clientMsgsAfter.push(history[i]);
    }
  }
  if (clientMsgsAfter.length === 0) return false;
  for (const m of clientMsgsAfter) {
    const body = (m.body ?? "").trim();
    if (body.length > 30) return false;
    if (!GREETING_ONLY_RX.test(body)) return false;
  }
  const agentBefore = history[lastAgentIdx];
  const clientMsg = clientMsgsAfter[clientMsgsAfter.length - 1];
  const agentTs = agentBefore.created_at ? Date.parse(agentBefore.created_at) : NaN;
  const clientTs = clientMsg.created_at
    ? Date.parse(clientMsg.created_at)
    : nowIso
      ? Date.parse(nowIso)
      : Date.now();
  if (!Number.isFinite(agentTs) || !Number.isFinite(clientTs)) return false;
  const gapMs = clientTs - agentTs;
  // Limiar reduzido de 3h → 1h para pegar gaps intermediários (ex.: cliente
  // some 1h e volta com "oi"): validado em investigação da conversa
  // fd475562 — vários turnos de 1-2h nunca disparavam o veto e a Júlia
  // ficava reformulando a mesma pergunta pendente do funil.
  const REENGAGEMENT_GAP_MS = 60 * 60 * 1000;
  return gapMs >= REENGAGEMENT_GAP_MS;
}

// Detecta o análogo IMEDIATO do REENGAJAMENTO em thread de disparo, SEM
// depender de gap de tempo: a última mensagem do agente é a PERGUNTA DE
// ABERTURA do disparo e o cliente respondeu apenas com saudação/cortesia
// neutra ("olá tudo bem?", "bom dia", ...). Nesses casos a Júlia precisa
// retribuir a saudação E REAPRESENTAR A ISCA (pergunta de abertura), em vez
// de cair na resposta genérica de receptivo/suporte ("Como posso te ajudar?").
// Fica unificado com o MODO REENGAJAMENTO — mesma resposta, disparado por
// hiato de tempo OU por resposta neutra logo após a abertura.
export function isNeutralGreetingAfterBlastOpening(history: Msg[]): boolean {
  if (!history?.length) return false;
  let lastAgentIdx = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].sender === "agente" && history[i].body?.trim()) {
      lastAgentIdx = i;
      break;
    }
  }
  if (lastAgentIdx < 0) return false;
  // Mesma regra do reengajamento: se o cliente mandou saudação + pergunta
  // real em burst, TODAS as mensagens dele após o agente precisam ser
  // saudação neutra pura pra classificar como cortesia.
  const clientMsgsAfter: Msg[] = [];
  for (let i = lastAgentIdx + 1; i < history.length; i += 1) {
    if (history[i].sender === "cliente" && history[i].body?.trim()) {
      clientMsgsAfter.push(history[i]);
    }
  }
  if (clientMsgsAfter.length === 0) return false;
  for (const m of clientMsgsAfter) {
    if (!isBlastNeutralGreeting((m.body ?? "").trim())) return false;
  }
  return isBlastOpeningQuestion(history[lastAgentIdx].body);
}

// Detecta por CONTEÚDO se essa thread é de disparo (Júlia iniciou o contato),
// independente da flag técnica `isInbound`. Necessário porque conversas antigas /
// reunificadas podem chegar como `isInbound=true` mesmo tendo sido abertas pela
// Júlia via disparo, e nesse caso o veto de reengajamento cai no ramo RECEPTIVO
// em vez do ramo DISPARO.
//
// STRICT MODE (regressão real: um agente RECEPTIVO/orgânico teve o
// EXEMPLO_MODELO_DISPARO promovido a script porque um "@" qualquer no histórico
// bateu no marker antigo). Regras endurecidas:
//   1) Só olha a PRIMEIRA mensagem do agente (a abertura). Frases similares que
//      apareçam depois no meio de uma conversa longa não contam.
//   2) Precisa de DOIS sinais fortes juntos: a pergunta-isca de abertura
//      (isBlastOpeningQuestion) OU uma frase de coleta explícita ("peguei seu
//      contato" / "vi seu perfil"). Handles avulsos "@algo" e "adorei o
//      conteúdo" NÃO mais promovem a conversa para disparo — geravam falso
//      positivo em conversas orgânicas.
export function historyLooksLikeBlast(history: Msg[]): boolean {
  if (!history?.length) return false;
  const firstAgent = history.find((m) => m.sender === "agente" && m.body?.trim());
  if (!firstAgent) return false;
  const strongOpenerMarker =
    /(peguei\s+o?\s*seu\s+contato|vi\s+seu\s+perfil)/i;
  return isBlastOpeningQuestion(firstAgent.body) || strongOpenerMarker.test(firstAgent.body);
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

// GUARD DETERMINÍSTICO CONTRA VAZAMENTO DE PROMPT INTERNO.
// Se o modelo ecoar (ou um bug de parsing empurrar) qualquer trecho de bloco
// de sistema para o texto de saída, o segmento é removido antes de virar
// mensagem no WhatsApp. Marcadores são strings que SÓ existem no prompt
// interno (cabeçalhos de veto, nomes de modo, tokens de identidade). Nunca
// deveriam aparecer numa resposta legítima da Júlia.
const INTERNAL_MARKER_PATTERNS: RegExp[] = [
  /⛔/,
  /VETO DE PRIORIDADE/i,
  /PRIORIDADE M[ÁA]XIMA/i,
  /MODO REENGAJAMENTO/i,
  /MODO [ÁA]UDIO/i,
  /MODO SUPORTE/i,
  /OBRIGA[ÇC][ÕO]ES desta resposta/i,
  /FORMATO OBRIGAT[ÓO]RIO/i,
  /EXEMPLO_MODELO_DISPARO/,
  /REFINAMENTOS DE TOM/i,
  /REGRA ABSOLUTA DE CONTEXTO/i,
  /SOBRESCREVE/,
  /buildSharedRules/,
  /\[sistema\]/i,
  /system prompt/i,
  // Rótulos de classificação/contexto ecoados pelo modelo como se fossem
  // conteúdo. Formato "Chave: valor" com chaves internas. Ex.:
  // "Categoria: vendas", "Urgência: alta", "Rede: YouTube", "Lead: quente".
  /^\s*(rede|categoria|urg[eê]ncia|classifica[cç][aã]o|prioridade|contexto|lead|temperatura|tag|etiqueta|status)\s*:/i,
  // Marcadores explícitos de "fato técnico"/prompt que o modelo por vezes ecoa.
  /FATO T[ÉE]CNICO VERIFICADO/i,
  /CONTEXTO PERSISTENTE DA CONVERSA/i,
];

// Heurística: bolha curta (2–5 tokens) sem pontuação de frase, contendo
// uma palavra em CAIXA ALTA (≥3 letras, provável nome próprio) + palavra
// típica de rótulo interno (rede, urgência, tempo). Ex.: "YouTube FELIPE hoje",
// "Instagram JOÃO urgente", "Spotify MARIA agora" — não são respostas
// legítimas da Júlia, são rótulos de classificação vazando.
function looksLikeInternalTagLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/[.!?,;]/.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  const CAPS_ALLOWLIST = new Set(["PIX", "CPF", "CNPJ", "MEI", "OK", "TTS", "IA", "SMM", "R$", "URL", "ID"]);
  const hasAllCapsName = tokens.some(
    (t) => /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]{3,}$/.test(t) && !CAPS_ALLOWLIST.has(t),
  );
  if (!hasAllCapsName) return false;
  const TAG_WORDS = /^(hoje|ontem|agora|urgente|urg[êe]ncia|hj|agr|frio|morno|quente|lead|prioridade|alta|baixa|m[eé]dia|novo|antigo|rede|categoria|instagram|youtube|tiktok|spotify|kwai|facebook)$/i;
  const hasTagWord = tokens.some((t) => TAG_WORDS.test(t));
  return hasTagWord;
}

export function sanitizeSystemLeaks(
  reply: string,
  opts: { isInbound?: boolean; reengagementGreeting?: boolean } = {},
): { text: string; leaked: boolean; removed: string[] } {
  if (!reply) return { text: reply, leaked: false, removed: [] };
  const removed: string[] = [];
  // Scrub por bolha (===SPLIT===) e depois por linha, para que uma bolha
  // inteira composta só de instrução de sistema seja descartada por completo.
  const parts = reply.split("===SPLIT===");
  const cleanedParts = parts
    .map((part) => {
      const keptLines = part.split(/\n/).filter((line) => {
        const hit =
          INTERNAL_MARKER_PATTERNS.some((rx) => rx.test(line)) ||
          looksLikeInternalTagLine(line);
        if (hit) removed.push(line.trim());
        return !hit;
      });
      return keptLines.join("\n").trim();
    })
    .filter((p) => p.length > 0);
  const cleaned = cleanedParts.join("\n===SPLIT===\n").replace(/\n{3,}/g, "\n\n").trim();
  const leaked = removed.length > 0;
  if (!cleaned) {
    // Se depois de remover marcadores não sobrou nada, devolve fallback seguro
    // por contexto — nunca deixa o cliente sem resposta nem envia string vazia.
    const fallback = opts.reengagementGreeting
      ? opts.isInbound
        ? "Oi! Como posso ajudar?"
        : "Oi! Posso te mostrar como acelerar suas redes?"
      : "Oi! Como posso ajudar?";
    return { text: fallback, leaked: true, removed };
  }
  return { text: cleaned, leaked, removed };
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
  { rx: /spotify|playlist|ouvintes?|saves?|m[uú]sica|artista|soundon/i, modules: ["spotify", "musica_cliente", "playlist_promo"] },
  { rx: /playlist|pacote|promo|ecl[eé]tic|eletr[oô]nic/i, modules: ["playlist_promo"] },
  { rx: /youtube|yt|inscritos?|view(s|er)?|monetiza|4000h|shorts?/i, modules: ["youtube"] },
  { rx: /instagram|insta|\big\b|reels?|stories?|seguidor/i, modules: ["instagram"] },
  { rx: /tiktok|tt\b/i, modules: ["tiktok"] },
  { rx: /kwai/i, modules: ["kwai"] },
  { rx: /facebook|fb\b|\bface\b/i, modules: ["facebook"] },
  { rx: /google|seo|maps|gmb|avalia[çc][aã]o/i, modules: ["seo_google"] },
  { rx: /pre[çc]o|valor|quanto custa|custa|tabela|or[çc]amento|cota[çc][aã]o|\br\$/i, modules: ["calculo_preco", "ancoragem_valor"] },
  { rx: /desconto|barato|caro|promo/i, modules: ["desconto_niveis", "objecoes", "ancoragem_valor", "playlist_promo"] },
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
  }).map(([k, v]) => [k, stripEmojiRuleDuplicates(k, v)] as [string, string]);
}

// ETAPA 1 — dedup fonte única de emoji. A regra canônica vive em
// identity.regra_emoji (buildSharedRules, topo do prompt) + trava
// determinística limitEmojiFrequency. Qualquer instrução sobre EMOJI
// que o usuário tenha escrito dentro de módulos editáveis (ex.:
// regras_gerais) é redundante e infla token — removemos parágrafos que
// mencionam "emoji" antes de injetar. Preserva o resto do módulo.
// Identidade NÃO passa por aqui (não é módulo, é bloco compartilhado).
const EMOJI_MENTION_RE = /emoji|emojis/i;
export function stripEmojiRuleDuplicates(moduleKey: string, content: string): string {
  if (!content) return content;
  // Estratégia menos agressiva: linha a linha. Uma linha que menciona
  // "emoji" é considerada duplicata da regra canônica (identity.regra_emoji)
  // e é removida. Preserva o resto do bloco intacto — zero risco de
  // comportamento pra outras instruções vizinhas.
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let dropped = 0;
  for (const line of lines) {
    if (EMOJI_MENTION_RE.test(line)) {
      dropped++;
      continue;
    }
    kept.push(line);
  }
  if (dropped > 0) {
    console.info("[dedup-emoji] lines stripped from module", {
      module: moduleKey,
      droppedLines: dropped,
      keptChars: kept.join("\n").length,
    });
  }
  // Colapsa 3+ quebras consecutivas em uma quebra dupla (evita buracos).
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const effectiveBlastPreview = !isInbound || historyLooksLikeBlast(history);
  const sharedRules = buildSharedRules(mergeIdentity(identity ?? null), {
    freeTestServices,
    brandBlocks,
    // Espelha o gate do runtime real (generateAgentReplyWithMeta): só expõe o
    // EXEMPLO_MODELO_DISPARO quando a conversa é efetivamente disparo.
    suppressExemploDisparo: !effectiveBlastPreview,
  });
  const latestClientMessage = getLatestClientMessage(history);
  const system = [
    sharedRules,
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    effectiveBlastPreview
      ? `DETECÇÃO DE CONTEXTO POR CONTEÚDO (backup, independente de flags técnicas): se você observar no histórico que a PRIMEIRA mensagem sua tem padrão de abertura de disparo (frases como "Peguei o seu contato" / "Vi seu perfil" combinadas com uma pergunta-isca do tipo "Posso te apresentar/mostrar uma forma de impulsionar..."), trate essa conversa como thread de DISPARO e siga o EXEMPLO_MODELO_DISPARO da identidade: interesse inicial vai direto para pergunta de rede, depois serviço, preço e só então objeção. Handle "@algo" avulso, sem essas frases, NÃO é sinal suficiente. O conteúdo real da conversa prevalece sobre metadados técnicos.`
      : "",
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
      if (!Array.isArray(faqs) || faqs.length === 0) return "";
      const sel = selectRelevantFaqs(faqs as Array<{ q: string; a: string }>, latestClientMessage);
      if (sel.length === 0) return "";
      return `FAQ (${sel.length}/${faqs.length}):\n${sel.map((f: { q: string; a: string }) => `- ${f.q} → ${f.a}`).join("\n")}`;
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
  reengagementGreeting?: boolean;
}): { model: "claude-sonnet-4-5" | "claude-haiku-4-5"; reason: string } {
  const msg = (opts.latestMessage ?? "").trim();
  if (opts.hasImage) return { model: "claude-sonnet-4-5", reason: "image_present" };
  if (opts.inputKind === "audio") return { model: "claude-sonnet-4-5", reason: "audio_input" };
  // Reengajamento após hiato: força Sonnet. Haiku ignora o veto de prioridade
  // máxima quando compete com script concreto (ver investigação fd475562).
  // Evento raro (só dispara com gap ≥1h + saudação seca), custo desprezível.
  if (opts.reengagementGreeting) return { model: "claude-sonnet-4-5", reason: "reengagement_greeting" };
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
  const { loadActiveDailyPromo } = await import("@/lib/agent-daily-promo.server");
  const { loadPlaylistCatalog } = await import("@/lib/playlist-catalog.server");
  const [identity, brandBlocks, dailyPromoText, playlistCatalog] = await Promise.all([
    loadAgentIdentity(userId),
    loadBrandBlocks(userId),
    loadActiveDailyPromo(userId),
    loadPlaylistCatalog(userId),
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
  // Detecção por CONTEÚDO: se o histórico começa com uma abertura de disparo
  // (pergunta-isca, "peguei seu contato", "@handle"), tratamos como disparo
  // mesmo que a flag técnica `isInbound` esteja errada (thread reunificada,
  // conversa antiga, webhook classificado como inbound, etc). Sem isso o
  // ramo RECEPTIVO ("Como posso ajudar?") sequestra respostas que deveriam
  // reapresentar a isca.
  const blastByContent = historyLooksLikeBlast(history);
  const effectiveBlast = !isInbound || blastByContent;
  // Cortesia neutra em resposta imediata à abertura de disparo: MESMA resposta
  // do MODO REENGAJAMENTO DISPARO, disparada sem depender de gap de tempo.
  const neutralGreetingAfterBlastOpening =
    effectiveBlast && isNeutralGreetingAfterBlastOpening(history);
  const blastReengagementVeto =
    (effectiveBlast && reengagementGreeting) || neutralGreetingAfterBlastOpening;
  const inboundReengagementVeto = !effectiveBlast && reengagementGreeting;
  const anyReengagementVeto = blastReengagementVeto || inboundReengagementVeto;

  // O fluxo de disparo agora vem exclusivamente de buildSharedRules(identity).
  const system = [
    // VETO DE PRIORIDADE MÁXIMA: o bloco MODO REENGAJAMENTO precede a
    // identidade (buildSharedRules), o EXEMPLO_MODELO_DISPARO e qualquer
    // refinamento de tom consultivo. Sem isso, em threads de disparo o modelo
    // reencaixa a próxima pergunta do funil mesmo depois de horas de hiato +
    // saudação seca do cliente.
    anyReengagementVeto
      ? (inboundReengagementVeto
          // CASO 1 — RECEPTIVO / SUPORTE: cliente iniciou o contato. Reengajar
          // com "como posso ajudar" — não existe "isca" a reapresentar.
          ? `⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO APÓS HIATO (RECEPTIVO) ⛔\nEste bloco SOBRESCREVE, nesta resposta, TODA a identidade abaixo, o EXEMPLO_MODELO_DISPARO, os refinamentos de tom do disparo, a ORDEM OBRIGATÓRIA do funil, qualquer regra de "interesse inicial pós-abertura", qualquer instrução de "vá direto para a pergunta de rede/serviço/quantidade" e QUALQUER lógica de disparo/blast/funil de vendas.\n\nCondição detectada: passaram VÁRIAS HORAS (ou virou o dia) desde a sua última mensagem, e o cliente voltou APENAS com uma saudação curta ("oi", "olá", "bom dia", "boa tarde", "boa noite", "tudo bem"). Esta conversa é RECEPTIVA (o cliente iniciou o contato originalmente).\n\nOBRIGAÇÕES desta resposta:\n1) Retribua a saudação e se coloque à disposição de forma neutra. FORMATO OBRIGATÓRIO em UMA ÚNICA mensagem curta, com DUAS partes NA ORDEM: (a) SAUDAÇÃO DE VOLTA equivalente à do cliente ("Bom dia!", "Boa tarde!", "Boa noite!", "Oi!") — OBRIGATÓRIA como PRIMEIRAS PALAVRAS LITERAIS da resposta; (b) "Como posso ajudar?" (ou variação curta: "Como posso te ajudar hoje?", "Tudo bem por aí? Como posso ajudar?"). Exemplos corretos: "Boa tarde! Como posso ajudar?" / "Bom dia! Como posso te ajudar hoje?" / "Oi! Tudo bem por aí? Como posso ajudar?".\n2) REGRA LITERAL DE ESPELHO DA SAUDAÇÃO: se o cliente disse "Bom dia" → sua resposta COMEÇA com "Bom dia!"; se disse "Boa tarde" → COMEÇA com "Boa tarde!"; se disse "Boa noite" → COMEÇA com "Boa noite!"; se disse "Oi"/"Olá"/"Opa" → COMEÇA com "Oi!" (ou a saudação do período atual do dia). NUNCA responda "Como posso ajudar?" cru, sem a saudação de volta — omitir a saudação de volta é ERRADO e QUEBRA O PADRÃO, é a regressão que já foi corrigida antes.\n3) PROIBIDO emendar automaticamente/repetir/reformular QUALQUER pergunta pendente do funil (rede, serviço, quantidade, "qual desses você quer priorizar", CTA, link do painel, preço, teste grátis, ancoragem).\n4) AGUARDE a próxima mensagem do cliente antes de retomar qualquer coisa.\n5) NÃO despache ===SPLIT===, NÃO envie link, NÃO cite preço, NÃO faça pergunta de negócio nesta resposta.`
          // CASO 2 — DISPARO / BLAST: a Júlia iniciou o contato via abordagem
          // fria. Reengajar REAPRESENTANDO A ISCA (pergunta final da abertura)
          // de forma resumida. Vale para AMBOS os gatilhos:
          //   (a) hiato de tempo (várias horas / virou o dia), OU
          //   (b) cliente respondeu à abertura só com saudação/cortesia neutra
          //       (sem hiato — regressão real observada em produção onde a
          //       Júlia caía no genérico de suporte "Como posso te ajudar?").
          : `⛔ VETO DE PRIORIDADE MÁXIMA — MODO REENGAJAMENTO / CORTESIA EM DISPARO ⛔\nEste bloco SOBRESCREVE, nesta resposta, TODA a identidade abaixo, o EXEMPLO_MODELO_DISPARO, os refinamentos de tom do disparo, a ORDEM OBRIGATÓRIA do funil, qualquer regra de "interesse inicial pós-abertura", qualquer instrução de "vá direto para a pergunta de rede/serviço/quantidade" e QUALQUER pergunta pendente do funil que exista no histórico.\n\nCondição detectada: você está em uma thread de DISPARO (VOCÊ iniciou o contato via abordagem fria) e o cliente respondeu à sua abertura APENAS com saudação/cortesia neutra ("oi", "olá", "bom dia", "boa tarde", "boa noite", "tudo bem?", "olá, tudo bem?"), SEM responder à pergunta da abertura. Isso vale tanto quando passaram várias horas desde a sua última mensagem (hiato) quanto quando a resposta veio poucos minutos depois (sem hiato). Em ambos os casos, a resposta correta é a MESMA: retribuir a saudação e REAPRESENTAR A ISCA da abertura — NUNCA cair na resposta genérica de receptivo/suporte "Oi! Como posso te ajudar?".\n\nOBRIGAÇÕES desta resposta:\n1) Retribua a saudação de forma calorosa e REAPRESENTE A ISCA — a pergunta FINAL da abertura de disparo, de forma RESUMIDA. FORMATO OBRIGATÓRIO em UMA ÚNICA mensagem curta, com DUAS partes NA ORDEM: (a) SAUDAÇÃO DE VOLTA equivalente à do cliente ("Bom dia!", "Boa tarde!", "Boa noite!", "Oi!") — OBRIGATÓRIA como primeiras palavras da resposta; (b) opcional "espero que esteja bem também" + a pergunta-isca. Exemplo: "Boa noite! Espero que esteja bem também. Posso te mostrar como dar uma acelerada nas suas redes?" (variações válidas do fim: "Posso te mostrar como acelerar suas redes?" / "Posso te mostrar como turbinar suas redes?" / "Posso te mostrar como impulsionar seu perfil?").\n2) PROIBIDO ABSOLUTO omitir a saudação de volta como primeiras palavras — começar direto com "Espero que esteja bem também" SEM "Bom dia/Boa tarde/Boa noite/Oi" antes é ERRADO e quebra o padrão.\n3) PROIBIDO ABSOLUTO responder com "Como posso te ajudar?", "Como posso ajudar?", "Em que posso ajudar?" ou qualquer variação de suporte/receptivo genérico — essa é a resposta de conversa RECEPTIVA e NÃO se aplica a disparo. Aqui a Júlia iniciou o contato com uma isca clara e precisa reapresentá-la.\n4) PROIBIDO repetir a abertura COMPLETA — NÃO diga "Peguei seu contato no perfil @...", NÃO cite o @ do Instagram, NÃO cumprimente pelo nome como se fosse a primeira mensagem, NÃO diga "adorei o conteúdo/estilo". Só a saudação de volta + a pergunta-isca final, resumida.\n5) PROIBIDO emendar/repetir/reformular a pergunta PENDENTE do funil (rede, serviço, quantidade, "qual desses você quer priorizar", CTA, link do painel, preço, teste grátis, ancoragem). Você está VOLTANDO para a pergunta-isca da abertura, NÃO avançando o funil.\n6) NÃO despache ===SPLIT===, NÃO envie link, NÃO cite preço nesta resposta.\n7) Depois desta resposta, se o cliente responder com interesse ("sim", "pode", "manda", "claro"), a PRÓXIMA resposta CONTINUA o funil de onde parou (retomar a pergunta pendente — ex: rede social) SEM repetir a abertura completa novamente.`)
      : "",
    buildSharedRules(identity, {
      freeTestServices,
      brandBlocks,
      dailyPromoText,
      playlistCatalog,
      // Duas razões pra suprimir o EXEMPLO_MODELO_DISPARO:
      // 1) Reengajamento ativo (hiato ou cortesia imediata em disparo) — o veto
      //    do topo precisa ficar sozinho sem competir com o script de vendas.
      // 2) Conversa NÃO é (efetivamente) de disparo — em thread orgânica /
      //    receptiva o modelo NÃO deve ter o few-shot com placeholders
      //    fictícios ({handle_instagram_exemplo}) disponível, senão pode
      //    copiá-lo literalmente no meio de uma conversa real (regressão
      //    observada em produção com "@sourcee" vazando pra cliente real).
      suppressExemploDisparo: anyReengagementVeto || !effectiveBlast,
    }),
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    // Backup textual só entra em conversas efetivamente de disparo. Antes
    // ficava fixo no prompt e induzia o modelo a "detectar disparo" em
    // conversa orgânica só porque tinha um "@" qualquer no histórico.
    effectiveBlast
      ? `DETECÇÃO DE CONTEXTO POR CONTEÚDO (backup, independente de flags técnicas): se você observar no histórico que a PRIMEIRA mensagem sua tem padrão de abertura de disparo (frases como "Peguei o seu contato" / "Vi seu perfil" combinadas com uma pergunta-isca do tipo "Posso te apresentar/mostrar uma forma de impulsionar..."), trate essa conversa como thread de DISPARO e siga o EXEMPLO_MODELO_DISPARO da identidade: interesse inicial vai direto para pergunta de rede, depois serviço, preço e só então objeção. Handle "@algo" avulso, sem essas frases, NÃO é sinal suficiente. O conteúdo real da conversa prevalece sobre metadados técnicos.`
      : "",
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
    effectiveBlast && !blastReengagementVeto
      ? `REFINAMENTOS DE TOM CONSULTIVO (aplicam ao EXEMPLO_MODELO_DISPARO da identidade):\n\n1) INTERESSE INICIAL APÓS ABERTURA:\n- Se o cliente respondeu positivamente à pergunta de abertura do disparo, vá direto para a pergunta de rede.\n- Não faça pergunta pessoal intermediária. Não pergunte se vive disso, se está começando, ou se ainda está montando público.\n\n2) VALIDAÇÃO EMOCIONAL CURTA:\n- Se o cliente compartilhar algo pessoal ou vulnerável depois de já estar conversando, valide em uma frase curta e siga para o próximo passo útil.\n- Use ===SPLIT=== só quando a validação precisar ficar separada da próxima pergunta.\n\n3) ANCORAGEM DE PREÇO:\n- Ao informar preço, ofereça primeiro a menor quantidade real do catálogo daquele serviço.\n- Estrutura: "Pra começar sem compromisso, [MÍNIMO REAL] sai [PREÇO REAL]. Já dá pra sentir o resultado, e se quiser ir de mais também tem, é só me falar."\n- Nunca use valores fixos de exemplo. O preço real sempre sai do catálogo.\n\n4) PROVA SOCIAL SUTIL, SEM INVENTAR NÚMEROS:\n- Permitido: "Muita gente começa assim", "Costuma ajudar bastante", "É um bom primeiro empurrão".\n- Proibido inventar estatísticas, quantidade de clientes, porcentagens ou resultados médios.\n\n5) QUANTIDADE SEMPRE VEM COM PREÇO DE ÂNCORA:\n- Sempre que apresentar opção de quantidade, inclua a menor quantidade real + preço real na mesma mensagem.\n- Não pergunte "quantas você quer?" sem dar uma referência de valor junto.`
      : "",
    // GANCHO PROMO DO DIA no primeiro "sim" do disparo: quando (a) contexto de
    // disparo/reativação, (b) NÃO está em veto de reengajamento e (c) existe
    // uma Promoção do Dia ATIVA no prompt, a Júlia usa a promoção como gancho
    // de entrada logo na primeira resposta pós-interesse, antes de emendar a
    // pergunta de rede. Mantém a mesma trava anti-alucinação — só menciona o
    // texto EXATO cadastrado, e some quando o toggle é desligado.
    buildBlastPromoHookBlock({
      effectiveBlast,
      anyReengagementVeto,
      dailyPromoText: dailyPromoText ?? null,
    }),
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
      const stored = (agent as { modules?: Record<string, string> }).modules;
      const enabled = (agent as { modules_enabled?: Record<string, boolean> }).modules_enabled ?? {};
      // Fallback aos DEFAULT_MODULES (ex.: playlist_promo) quando o usuário
      // ainda não salvou aquele módulo no agent_config.
      const mods: Record<string, string> = { ...DEFAULT_MODULES, ...(stored && typeof stored === "object" ? stored : {}) };
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
      if (!Array.isArray(faqs) || faqs.length === 0) return "";
      const sel = selectRelevantFaqs(faqs, latestClientMessage);
      if (sel.length === 0) return "";
      // ETAPA 4 — só entra as FAQs relevantes; preâmbulo enxuto (o filtro
      // determinístico já eliminou o risco que o LLM assumia antes).
      return `FAQ INTERNO (${sel.length}/${faqs.length} — pré-filtradas por relevância à pergunta atual):\n${sel.map((f) => `- ${f.q} → ${f.a}`).join("\n")}\n\nRegras:\n1. Reformule com suas palavras, curto e humano (máx 2 linhas).\n2. Se nenhuma das FAQs acima realmente responde a pergunta, IGNORE e responda naturalmente.\n3. Nunca copie literalmente.`;
    })(),
    `Quando o cliente confirmar uma compra ou pagamento (mencionar PIX enviado, comprovante, "paguei", "fechei", confirmar pedido), trate-o como Cliente daqui em diante.`,
    `QUEM PROCESSA O PEDIDO É O CLIENTE (regra absoluta):\n- VOCÊ NUNCA pede link "para processar o pedido". Quem faz o pedido é o CLIENTE, dentro do painel: ele adiciona saldo, escolhe o serviço, cola o link e confirma.\n- Quando o cliente disser que está comprando, fazendo PIX, cadastrando ou adicionando saldo, responda exatamente nesse tom: "Ótimo! Quando o saldo cair na conta é só escolher o serviço no painel, colar o link do seu vídeo e confirmar. Qualquer dúvida me chama!"\n- PROIBIDO dizer: "me manda o link que eu processo pra você", "me passa o link que eu faço o pedido", "manda o link aqui que eu cuido". Você NUNCA processa pedido manualmente.\n- A única situação em que você pede link é para TESTE GRÁTIS (regra própria abaixo) — nunca para pedido pago.`,
    `CADASTRO NO PAINEL — INTERPRETAÇÃO E FLUXO (ABSOLUTA):\n- INTERPRETAÇÃO DE RESPOSTAS AMBÍGUAS sobre "já tem cadastro/conta no painel?":\n  • "tenho não", "tenho nao", "nao tenho", "não tenho", "ainda não", "ainda nao", "nao", "não", "é meu primeiro contato", "primeira vez", "sou novo", "nunca usei", "nunca comprei" → SIGNIFICA QUE O CLIENTE NÃO TEM CADASTRO. É PROIBIDO interpretar "tenho não" como "tenho" — em português coloquial, "tenho não" = "não tenho".\n  • "tenho sim", "sim", "já tenho", "ja tenho", "tenho", "sou cliente", "já comprei antes", "não é meu primeiro" → cliente JÁ tem cadastro; siga direto para escolher serviço/quantidade/link do vídeo.\n- FLUXO QUANDO CLIENTE NÃO TEM CADASTRO (primeiro contato / primeira compra):\n  1) Envie o LINK DO PAINEL ${agent.panel_link ? `(${agent.panel_link})` : "(use o link do painel configurado)"} e instrua a fazer o cadastro. Ex: "Show! Então é rapidinho: faz seu cadastro aqui${agent.panel_link ? " " + agent.panel_link : ""} 😊"\n  2) Depois do cadastro, oriente a DEPOSITAR via PIX no menu Depositar/Adicionar Saldo.\n  3) Depois do saldo, oriente a ESCOLHER O SERVIÇO no painel, COLAR O LINK DO VÍDEO dele e CONFIRMAR o pedido.\n  4) Ofereça-se para tirar dúvidas em cada etapa. Use ===SPLIT=== entre a instrução de cadastro e a próxima etapa quando fizer sentido.\n- PROIBIDO, quando o cliente disse que é primeiro contato / não tem cadastro, perguntar de novo "qual serviço você quer fechar?" antes de mandar o link e ensinar o cadastro. Isso é regressão real — o cliente precisa PRIMEIRO se cadastrar e depositar para conseguir comprar.`,
    `MENSAGEM FORA DE CONTEXTO (meme, figurinha, piada, assunto pessoal, casamento, futebol, etc.):\n- Se a última mensagem do cliente NÃO tem relação com serviço, pedido, painel, preço, pagamento ou dúvida do produto, NÃO continue o fluxo de venda. NÃO peça link. NÃO ofereça nada.\n- Responda apenas algo curto e descontraído, ex: "Haha! 😄 Quando quiser continuar é só me chamar!" e ENCERRE — sem perguntas, sem CTA, sem link.\n- Aguarde o cliente voltar com assunto relevante. Só retome o fluxo comercial quando ele mesmo trouxer o tema.`,
    // ETAPA 1 dedup: bloco reduzido. Regra de FREQUÊNCIA de emoji na resposta
    // é FONTE ÚNICA em identity.regra_emoji (buildSharedRules) + trava
    // determinística em limitEmojiFrequency. Aqui só resta a lógica de
    // REAÇÃO a mensagens curtas do cliente (não é sobre nosso output).
    `REAÇÕES CURTAS DO CLIENTE (ABSOLUTA):\n- EXCEÇÃO CRÍTICA (janela estreita): a exceção de "interesse inicial pós-abertura" SÓ vale se TODAS as condições forem verdadeiras ao mesmo tempo:\n   (a) a ÚLTIMA pergunta sua no histórico é LITERALMENTE a pergunta de abertura do disparo ("posso te mostrar/apresentar algo que pode impulsionar/turbinar/acelerar suas redes?");\n   (b) você AINDA NÃO fez nenhuma pergunta de rede/serviço/quantidade nesta conversa;\n   (c) você AINDA NÃO tratou nenhum tema de suporte/pós-venda (status, pedido, painel, saldo, ticket, pagamento, comprovante).\n  Se as três condições estão satisfeitas e o cliente respondeu "ok", "show", "beleza", "manda", "claro", "vai", "fala", "pode" ou qualquer resposta curta que NÃO seja recusa clara, trate como INTERESSE INICIAL e avance direto para a pergunta de rede do EXEMPLO_MODELO_DISPARO.\n- FORA dessa janela (conversa de suporte, cliente ativo com pedido em andamento, resposta a uma explicação de status, agradecimento, ou qualquer outra situação): "ok"/"blz"/"obrigado" NÃO é sinal para avançar o funil. É só uma CONFIRMAÇÃO — reconheça de forma neutra e curta ("Fechado!", "Qualquer coisa me chama") e PARE. NUNCA pergunte "qual rede social você quer impulsionar" nesse cenário.\n- Se a última mensagem for apenas figurinha sem texto, "ok", "show", "vou ver", "vou analisar" ou confirmação curta, NÃO faça pergunta de negócio, NÃO ofereça serviço, NÃO envie link e NÃO use ===SPLIT===, exceto na janela estreita descrita acima.\n- Confirmação curta tipo "ok" / "👍" / figurinha sem texto: prefira silêncio ou resposta mínima ("Show!").\n- Quando o cliente disser que vai analisar/decidir/ver depois, responda EXATAMENTE UMA ÚNICA mensagem curta ("Tá bom! Qualquer coisa me chama") e pare.\n- PROIBIDO mandar duas mensagens de aguardo em sequência como "Tá bom! Me chama quando decidir" + "Certo, fico no aguardo". Nunca use ===SPLIT=== em aguardo ou confirmação curta.`,
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
    imageBase64
      ? `IMAGEM NA CONVERSA (ABSOLUTA — sobrepõe qualquer regra de descoberta):\n- A imagem que chegou é CONTEXTO ADICIONAL do momento atual da conversa. NUNCA é motivo para resetar o funil ou reperguntar algo que já foi combinado no histórico acima (rede, serviço, quantidade, cadastro, pagamento).\n- Antes de responder, releia o histórico e identifique o que JÁ FOI decidido — nunca pergunte de novo "qual rede", "qual gênero/estilo", "qual serviço", "qual quantidade" sobre item já respondido.\n- Se a imagem for tela de PAGAMENTO / CHECKOUT / gerar PIX / QR Code / botão "Confirmar pedido" / "Finalizar" / valor a pagar: o cliente está PRESTES A FECHAR. Responda AJUDANDO A CONCLUIR — confirme o valor/serviço visível ("Isso mesmo, R$X pelos [N] [serviço] no [rede]!"), oriente o próximo clique específico da tela ("é só clicar em Confirmar / colar o link da sua [música/vídeo] / gerar o PIX"), e reforce que está tudo certo. PROIBIDO voltar a pergunta de descoberta nesse momento.\n- Se for print do painel com erro/status/pedido, siga as regras específicas de SUPORTE e STATUS acima.\n- Se for comprovante de pagamento, siga a regra de COMPROVANTE acima.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Janela de histórico: normalmente 8 turnos bastam, mas quando o cliente
  // manda IMAGEM o modelo Vision tende a colar no que vê e "esquecer" o
  // resto da conversa (rede, serviço, quantidade, cadastro já combinados).
  // Para print de painel/pagamento no meio de conversa avançada, precisamos
  // que o histórico completo do funil chegue junto — expande pra 20 turnos.
  const historyWindow = imageBase64 ? 20 : 8;
  const messages = history.slice(-historyWindow).map((m) => ({
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
    // Força Sonnet também quando a cortesia neutra em disparo dispara o veto
    // (sem hiato de tempo). Mesmo motivo do reengajamento: Haiku ignora o
    // veto quando compete com o script completo do disparo.
    reengagementGreeting: reengagementGreeting || neutralGreetingAfterBlastOpening,
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
      text:
        `Analise essa imagem COMO CONTEXTO ADICIONAL da conversa que já está em andamento — NÃO como um reset.\n` +
        `\n` +
        `REGRAS OBRIGATÓRIAS ao responder com imagem:\n` +
        `1) Considere TODO o histórico acima antes de responder. Se rede, serviço, quantidade, cadastro, pagamento ou qualquer etapa JÁ FORAM combinados/respondidos na conversa, é PROIBIDO voltar a perguntar. NUNCA faça pergunta de descoberta ("qual rede", "qual estilo/gênero", "qual serviço", "qual quantidade") sobre algo que já apareceu no histórico.\n` +
        `2) Se a imagem mostrar tela de PAGAMENTO / CHECKOUT / PIX / QR Code / botão "Confirmar pedido" / "Finalizar compra" / valor a pagar no painel: o cliente está PRESTES A FECHAR. Responda AJUDANDO A CONCLUIR — confirme o valor/serviço que aparece na tela, oriente o próximo clique específico visível (ex: "É só clicar em Confirmar / gerar o PIX / colar o link do vídeo"), e reforce que está tudo certo. NUNCA volte pra descoberta nesse momento.\n` +
        `3) Se a imagem for print de ERRO no painel, siga o fluxo de suporte (regra própria acima).\n` +
        `4) Se a imagem for comprovante de pagamento, siga a regra de COMPROVANTE (parabeniza + orienta pedido no painel).\n` +
        `\n` +
        `Última mensagem do cliente junto com a imagem: ${baseText}`,
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
      // Prompt caching: o system prompt (~10k tokens) é praticamente idêntico
      // entre chamadas do mesmo agente. Marcando cache_control:ephemeral,
      // chamadas subsequentes dentro de ~5 min pagam ~10% do custo de input
      // desse bloco (cache read) em vez do valor cheio.
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: finalMessages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude falhou (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  const usage = json.usage ?? {};
  console.info("[agent-ai] Claude usage", {
    model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  });
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
  // GUARD FINAL — nunca deixa cabeçalho/instrução de sistema vazar para o
  // cliente, aconteça o que acontecer na geração (modelo ecoou, parser bugou,
  // etc). É a última barreira antes de o texto virar mensagem no WhatsApp.
  const scrubbed = sanitizeSystemLeaks(guarded.text, {
    isInbound,
    reengagementGreeting,
  });
  if (scrubbed.leaked) {
    console.error("[agent-ai] GUARD: vazamento de prompt interno bloqueado", {
      removedPreview: scrubbed.removed.slice(0, 3).map((s) => s.slice(0, 200)),
      originalPreview: guarded.text.slice(0, 300),
      finalPreview: scrubbed.text.slice(0, 200),
      isInbound,
      reengagementGreeting,
    });
  }
  // GUARD FINAL de saudação no MODO REENGAJAMENTO: se ativou o veto (hiato
  // receptivo OU cortesia neutra em disparo) e a resposta ainda começa sem
  // saudação de volta ("Como posso ajudar?" cru), prepende a saudação
  // correspondente à do cliente. Determinístico — pega regressão em prod.
  let outText = scrubbed.text;
  if (reengagementGreeting || neutralGreetingAfterBlastOpening) {
    const enforced = enforceReengagementGreeting(outText, latestClientMessage);
    if (enforced.prepended) {
      console.warn("[agent-ai] GUARD: saudação de reengajamento prependida", {
        clientMsgPreview: latestClientMessage.slice(0, 60),
        before: outText.slice(0, 80),
        after: enforced.text.slice(0, 80),
      });
    }
    outText = enforced.text;
  }
  return { text: outText, model, routingReason };
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