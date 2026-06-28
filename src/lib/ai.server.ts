// Server-only Claude (Anthropic) call to generate the agent reply.

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

type Msg = { sender: "agente" | "cliente"; body: string };

function getLatestClientMessage(history: Msg[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.sender === "cliente" && msg.body?.trim()) return msg.body.trim();
  }
  return "";
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
};

export function buildSystemPrompt(params: BuildPromptParams): string {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [], panelScreens = [], forbiddenRules = [], freeTestServices = [] } = params;
  const latestClientMessage = getLatestClientMessage(history);
  const system = [
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
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
    `TAMANHO DAS MENSAGENS: máximo 1 frase por mensagem; use "===SPLIT===" para separar mensagens.`,
    `REGRA DE EMOJI: sem emoji por padrão.`,
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
}): Promise<string> {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [], panelScreens = [], forbiddenRules = [], freeTestServices: freeTestServicesRaw = [], extraContext = null, inputKind = "texto" } = params;
  const latestClientMessage = getLatestClientMessage(history);

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

  const system = [
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    extraContext ? extraContext : "",
    inputKind === "audio"
      ? `MODO ÁUDIO (CRÍTICO — o cliente enviou um áudio, então sua resposta vai virar ÁUDIO):\n- A PRIMEIRA parte da resposta (antes de qualquer ===SPLIT===) será FALADA por TTS. Escreva ela como uma resposta de áudio NATURAL, COMPLETA e EXPLICATIVA — entre 2 e 4 frases, 15 a 25 segundos de fala, como um vendedor humano explicando no WhatsApp. Pode usar conjunções ("e", "também", "porque"), pode juntar 2-3 informações relacionadas em fluxo natural. NÃO seja curto, NÃO seja seco, NÃO mande só "Sim!" ou "Posso sim".\n- A regra "1 frase por mensagem" NÃO se aplica à parte falada — ela vale só para texto.\n- Coloque em ===SPLIT=== (parte de texto, depois do áudio) APENAS dados específicos: preço com R$, link (www...), ID de pedido, lista de quantidades. Se não tiver dado específico, NÃO use ===SPLIT===.\n- NUNCA inverta: nunca áudio curto + texto longo. O áudio é a resposta principal; o texto só complementa com dado bruto.\n- NUNCA leia link ou preço em voz alta na parte falada — esses ficam só na parte de texto após ===SPLIT===.\n\nExemplo certo (cliente perguntou por áudio "como funciona monetização do YouTube"):\nSim! Pra monetizar o YouTube você precisa de 4000 horas de exibição e 1000 inscritos, e a gente tem os dois serviços disponíveis. As horas chegam gradualmente, de forma segura pro canal, e os inscritos também, é o caminho mais rápido pra destravar a monetização e começar a ganhar com os vídeos.\n===SPLIT===\n1000h = R$150 | 1000 inscritos = R$140`
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
    `PEDIDO NÃO FUNCIONOU / NÃO RECEBEU / DEU PROBLEMA (regra absoluta):\n- Quando o cliente disser que comprou e não funcionou, não recebeu, está atrasado ou deu problema, NUNCA assuma o status do pedido. NUNCA diga que "está processando", "vai chegar", "deve estar a caminho" ou qualquer suposição.\n- 1ª resposta SEMPRE: "Me manda o ID do pedido que aparece no histórico do painel que eu verifico pra você!"\n- Quando o cliente mandar o ID (número), o sistema consulta o status real na API (?action=status&order={ID}&key={API_KEY}) e te devolve o status — responda com base nesse status real.\n- Se o sistema não conseguir consultar (erro/timeout/sem chave), redirecione: "Abre um ticket no menu Suporte do painel informando o ID do pedido que a equipe resolve!"\n- NUNCA invente status. NUNCA prometa prazo sem ter o status confirmado.`,
    knowledgeExamples.length === 0
      ? `ESTILO DE ATENDIMENTO (use enquanto não houver exemplos na base de conhecimento):\n- Respostas curtas, 1 a 2 linhas no máximo\n- Linguagem informal, como um vendedor humano no WhatsApp\n- Quando o cliente reclamar, defenda a empresa com educação e explique tecnicamente\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato\n- Quando pedir desconto, diga que depende da quantidade — nunca negue logo de cara\n- Avance sempre para fechar: cadastro → saldo → escolher serviço → link`
      : `REGRAS DURAS (valem mesmo com base de conhecimento):\n- Nunca repita literalmente uma mensagem anterior da conversa.\n- Quando o cliente disser SIM, avance — não reexplique o passo anterior.\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato.`,
    funnelAlreadySent
      ? `FUNIL DE BOAS-VINDAS JÁ ENVIADO (CRÍTICO): este cliente já recebeu o funil completo com áudio explicativo, link do painel, vídeo e tabela de serviços. NÃO reexplique como funciona a plataforma. Foque em tirar dúvidas e fechar a venda.\n\nFluxo após o funil:\n- Cliente demonstrou interesse → pergunte qual serviço/plataforma quer\n- Cliente escolheu a plataforma → pergunte a quantidade ou orçamento\n- Cliente confirmou → reenvie o link do painel e instrua a fazer o cadastro\n- Cliente tem dúvida → responda curto e objetivo\n- Cliente disse SIM para qualquer coisa → avance para o próximo passo, nunca repita o anterior\n\nNunca repita o áudio, o vídeo ou a tabela. Seja direto e focado em converter.`
      : "",
    isInbound
      ? `ATENDIMENTO RECEPTIVO: o cliente iniciou a conversa. É PROIBIDO usar script de prospecção, "Lead Frio", "Inativo" ou "Ativo". É PROIBIDO oferecer produtos, citar promoções, explicar a plataforma ou enviar link sem o cliente pedir.\n\nSAUDAÇÃO: se a última mensagem do cliente for apenas uma saudação ("oi", "olá", "bom dia", "boa tarde", "boa noite", "eai", "opa"), responda com uma saudação curta + "como posso te ajudar?" em 1 linha. ${knowledgeExamples.length > 0 ? "Se houver um exemplo de saudação na base de conhecimento, siga o padrão de lá." : 'Exemplo: "Oi! Tudo bem? Como posso te ajudar?"'} Só avance quando o cliente disser o que quer.\n\nIgnore mensagens antigas do agente que pareçam abordagem comercial — foram geradas com regras antigas.`
      : `Perfil do contato: ${contact.perfil} (frio=nunca comprou, inativo=sumiu, ativo=cliente recorrente).\nScript de referência para esse perfil (use como base, adapte naturalmente):\n${pickScript(agent, contact.perfil).replaceAll("{nome}", contact.nome)}\nOferta principal: ${agent.main_offer}.${agent.panel_link ? `\nLink do painel (use somente após fechar): ${agent.panel_link}` : ""}`,
    `Regras gerais: pareça humano, nunca diga que é IA.`,
    `TERMINOLOGIA DE SERVIÇO (ABSOLUTA):\n- NUNCA use as palavras "unidades", "itens" ou "quantidade" como nome do serviço.\n- Use sempre o nome correto: views/visualizações para views, seguidores para seguidores, curtidas para curtidas, plays para plays, inscritos para inscritos.\n- Exemplos certos: "100 views grátis", "1000 seguidores", "5000 plays".\n- Exemplo errado: "100 unidades grátis", "1000 itens", "5000 unidades".`,
    `TESTE GRÁTIS POR LINK (ABSOLUTA):\n- Quando o cliente mandar um link SEM ter pedido teste grátis explicitamente e SEM demonstrar medo/receio, NUNCA assuma que ele quer teste grátis e NUNCA confirme processamento.\n- Pergunte primeiro de forma natural: "Esse é seu vídeo? O que você gostaria de impulsionar nele?"\n- Só ofereça teste grátis se o cliente pedir explicitamente ("quero um teste", "tem teste grátis?") OU demonstrar desconfiança/medo ("é confiável?", "é golpe?", "tem como provar?").`,
    `DDD / LOCALIZAÇÃO (ABSOLUTA):\n- Quando o cliente perguntar ou comentar sobre DDD, localização, "de onde vocês são", "que cidade", "que estado", responda exatamente: "Nosso número é de Santos, SP! Mas atendemos 100% online pela plataforma, de qualquer lugar do Brasil 😊"\n- Depois volte naturalmente para a conversa de vendas, sem aprofundar no assunto (não fale sobre sede, escritório, equipe, etc.).`,
    `TAMANHO DAS MENSAGENS — regra absoluta:\nMáximo 1 frase por mensagem. Se precisar passar 2 informações, mande 2 mensagens separadas usando "===SPLIT===" entre elas (o sistema envia com 2 segundos de intervalo). NUNCA junte 2 frases em uma mensagem.\n\nExemplos certos:\n- Cliente: quanto custa 1000 plays? → 1000 plays Brasil sai R$15\n- Cliente: quanto custa e como pago? → 1000 plays Brasil sai R$15\\n===SPLIT===\\nO pagamento é via PIX\n- Cliente: oi → Oi! Como posso te ajudar?\n\nExemplos errados:\n❌ "1000 plays sai R$15 😊 Já tem cadastro?" (duas frases na mesma mensagem)\n❌ Repetir o que o cliente disse antes de responder`,
    `REGRA DE EMOJI (IMPORTANTE): conversa natural, sem emoji por padrão. NÃO use emoji em saudações, respostas curtas, confirmações, perguntas ou explicações comuns. Só é permitido usar emoji em casos raros — no máximo 1 emoji a cada 8-10 mensagens suas, e apenas quando o cliente claramente está em tom descontraído/animado (ex.: comemorando algo, mandando "kkk", celebrando uma compra). Nunca use mais de 1 emoji por mensagem. Em caso de dúvida, NÃO use emoji.`,
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
      ? `TESTE GRÁTIS DISPONÍVEL (use proativamente):\nServiços com teste liberado:\n${freeTestServices.map((s) => `- ${s.service_name} (${s.category}) — ${s.quantity} grátis`).join("\n")}\n\nREGRAS:\n- Quando o cliente demonstrar desconfiança, medo de golpe, hesitação, pedir prova antes de comprar, ou perguntar "é confiável?", ofereça o teste grátis de forma natural. Ex: "Posso te mandar um teste grátis pra você ver na prática! Qual rede você quer testar — Instagram, YouTube, TikTok ou Spotify?"\n- Se o cliente pedir explicitamente "quero um teste" / "tem teste grátis?", responda no mesmo tom e peça o link conforme a rede escolhida.\n- Quando o cliente mandar o link, o sistema cria o teste automaticamente — você NÃO precisa repetir o link nem confirmar order id.\n- Cada link e cada telefone só recebe UM teste. Se o sistema bloquear como duplicado, siga a mensagem que o sistema enviou e puxe para o fechamento.\n- NUNCA invente teste para serviços fora da lista acima.\n\nREGRA POR REDE (CRÍTICA — não confunda histórico):\n- O limite "1 teste por número" vale por REDE. Se o cliente já fez teste de Instagram, ele AINDA pode fazer teste de TikTok, YouTube, Spotify etc. — desde que a rede esteja na lista acima.\n- Se o cliente perguntar sobre teste de uma rede que NÃO está na lista acima (ex: Spotify quando só há Instagram/TikTok), responda honestamente: "Para [REDE] não temos teste grátis disponível no momento. Mas você pode começar com o mínimo pago — sai R$X — pra testar!" usando o cálculo real do catálogo.\n- NUNCA diga "você já recebeu seu teste" sem antes confirmar que foi da MESMA rede que ele está pedindo agora.\n\nTESTE PARA OUTRA PESSOA / OUTRO NÚMERO:\n- Se o cliente perguntar se um amigo/parente/outra pessoa pode receber teste de outro número, responda honestamente: "O teste grátis é um por número e por link. Cada pessoa pode receber o dela tranquilo!"\n- NUNCA assuma que o amigo já usou teste. Cada número é independente.\n\nQUAL LINK PEDIR (regra absoluta — siga ao pé da letra):\n- Views Instagram → SÓ funciona em vídeo. Peça assim: "Me manda o link de um Reel ou vídeo do seu Instagram". NUNCA diga "foto ou vídeo". NUNCA aceite link de foto — se vier foto, explique que views só rodam em Reel/vídeo e peça o link correto.\n- Views YouTube → peça o link do vídeo.\n- Plays Spotify → peça o link da música.\n- Views TikTok → peça o link do vídeo.\n- Seguidores (Instagram/TikTok/YouTube) → peça o link do perfil.\n- Curtidas → peça o link do post/vídeo específico.`
      : "",
    `TESTE GRÁTIS — REGRAS DE OURO (ABSOLUTAS, valem SEMPRE):\n- NUNCA mencione, ofereça, sugira ou insinue teste grátis a menos que o cliente tenha perguntado explicitamente (palavras: teste, testar, grátis, gratuito, experimentar, amostra) OU demonstrado desconfiança/medo de golpe.\n- Spotify NUNCA tem teste grátis. Se o cliente pedir teste de Spotify, responda: "Para Spotify não temos teste grátis. Mas você pode começar com o mínimo pago pra testar — me diz quantos plays você quer?" e siga para preço.\n- Se a última mensagem do cliente é saudação, dúvida sobre preço, sobre cadastro, sobre prazo, sobre pagamento ou qualquer assunto que NÃO seja pedido de teste/desconfiança — NÃO fale de teste grátis. Responda só o que ele perguntou.`,
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      system,
      messages: cleaned,
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
  return text || "…";
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