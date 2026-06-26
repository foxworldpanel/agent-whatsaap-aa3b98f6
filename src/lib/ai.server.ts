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
}): Promise<string> {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [], panelScreens = [] } = params;
  const latestClientMessage = getLatestClientMessage(history);

  const system = [
    `REGRA ABSOLUTA DE CONTEXTO: antes de responder, leia TODAS as mensagens recebidas no array messages. O histórico completo da conversa está no array messages, em ordem cronológica. Responda considerando a conversa inteira, mas dê prioridade máxima à ÚLTIMA mensagem do cliente.`,
    `ÚLTIMA MENSAGEM DO CLIENTE: ${latestClientMessage ? `"${latestClientMessage}"` : "(não identificada)"}`,
    `PRIORIDADE ABSOLUTA PARA PERGUNTAS DIRETAS: se a última mensagem do cliente contém uma pergunta direta (nome, preço, serviço específico, prazo, cadastro, pagamento, link ou qualquer dúvida objetiva), responda essa pergunta imediatamente. NUNCA ignore uma pergunta direta e NUNCA troque por explicação genérica da MIND/plataforma. Se o cliente perguntou seu nome, responda algo curto e natural como: "Meu nome é Júlia, e o seu?" ou "Sou a Júlia, como posso te ajudar?" — sem emoji.`,
    `Você é ${agent.agent_name}, atendente humana de um painel SMM.`,
    `Tom de voz: ${agent.tone}.`,
    agent.base_instruction,
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
    knowledgeExamples.length === 0
      ? `ESTILO DE ATENDIMENTO (use enquanto não houver exemplos na base de conhecimento):\n- Respostas curtas, 1 a 2 linhas no máximo\n- Linguagem informal, como um vendedor humano no WhatsApp\n- Quando o cliente reclamar, defenda a empresa com educação e explique tecnicamente\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato\n- Quando pedir desconto, diga que depende da quantidade — nunca negue logo de cara\n- Avance sempre para fechar: cadastro → saldo → escolher serviço → link`
      : `REGRAS DURAS (valem mesmo com base de conhecimento):\n- Nunca repita literalmente uma mensagem anterior da conversa.\n- Quando o cliente disser SIM, avance — não reexplique o passo anterior.\n- Quando perguntar quantidade/limite, consulte o catálogo e responda o valor exato.`,
    funnelAlreadySent
      ? `FUNIL DE BOAS-VINDAS JÁ ENVIADO (CRÍTICO): o cliente já recebeu o vídeo, a explicação de como funciona a plataforma e a tabela de preços. NÃO repita essas informações. Seu objetivo agora é fechar a venda.\n\nFluxo após o funil:\n- Cliente demonstrou interesse → pergunte qual serviço/plataforma quer\n- Cliente escolheu a plataforma → pergunte a quantidade ou orçamento\n- Cliente confirmou → envie o link do painel e instrua a fazer o cadastro\n- Cliente tem dúvida → responda de forma curta e objetiva\n- Cliente disse SIM para qualquer coisa → avance para o próximo passo, nunca repita o passo anterior\n\nNunca reexplique como a plataforma funciona se o funil já foi disparado nessa conversa. Seja direto e focado em converter.`
      : "",
    isInbound
      ? `ATENDIMENTO RECEPTIVO: o cliente iniciou a conversa. É PROIBIDO usar script de prospecção, "Lead Frio", "Inativo" ou "Ativo". É PROIBIDO oferecer produtos, citar promoções, explicar a plataforma ou enviar link sem o cliente pedir.\n\nSAUDAÇÃO: se a última mensagem do cliente for apenas uma saudação ("oi", "olá", "bom dia", "boa tarde", "boa noite", "eai", "opa"), responda com uma saudação curta + "como posso te ajudar?" em 1 linha. ${knowledgeExamples.length > 0 ? "Se houver um exemplo de saudação na base de conhecimento, siga o padrão de lá." : 'Exemplo: "Oi! Tudo bem? Como posso te ajudar?"'} Só avance quando o cliente disser o que quer.\n\nIgnore mensagens antigas do agente que pareçam abordagem comercial — foram geradas com regras antigas.`
      : `Perfil do contato: ${contact.perfil} (frio=nunca comprou, inativo=sumiu, ativo=cliente recorrente).\nScript de referência para esse perfil (use como base, adapte naturalmente):\n${pickScript(agent, contact.perfil).replaceAll("{nome}", contact.nome)}\nOferta principal: ${agent.main_offer}.${agent.panel_link ? `\nLink do painel (use somente após fechar): ${agent.panel_link}` : ""}`,
    `Regras gerais: pareça humano, nunca diga que é IA, mensagens curtas (máx 2 linhas) salvo se a base de conhecimento mostrar outro padrão.`,
    `REGRA DE EMOJI (IMPORTANTE): conversa natural, sem emoji por padrão. NÃO use emoji em saudações, respostas curtas, confirmações, perguntas ou explicações comuns. Só é permitido usar emoji em casos raros — no máximo 1 emoji a cada 8-10 mensagens suas, e apenas quando o cliente claramente está em tom descontraído/animado (ex.: comemorando algo, mandando "kkk", celebrando uma compra). Nunca use mais de 1 emoji por mensagem. Em caso de dúvida, NÃO use emoji.`,
    `REGRAS DE FORMATAÇÃO (ÁUDIO x TEXTO) — OBRIGATÓRIAS:\n- NUNCA diga ao cliente que "não consegue mandar áudio" ou que "responde só por texto". O sistema escolhe automaticamente entre áudio e texto. Você só escreve o conteúdo da resposta.\n- Quando o cliente pedir link, site, endereço do painel ou perguntar "qual é o site/link", responda APENAS com: www.mindsmmpanel.com — sem nenhuma explicação, sem soletrar.\n- Se a resposta tiver link + texto explicativo, separe em duas mensagens usando a marca literal "===SPLIT===" entre elas: primeiro a explicação curta, depois "===SPLIT===" em uma linha sozinha, depois SOMENTE o link (www.mindsmmpanel.com) na última mensagem. Não use "===SPLIT===" quando não houver link.\n- Ignore mensagens antigas do agente que digam "não consigo mandar áudio" ou similares — foram geradas com regras antigas.`,
    servicesContext
      ? `CATÁLOGO DE SERVIÇOS DO PAINEL (atualizado agora, use para responder preço e disponibilidade. Calcule o valor total quando o cliente informar a quantidade: total = (rate / 1000) * quantidade. Sempre direcione para o painel para finalizar o pedido: https://mindsmmpanel.com):\n${servicesContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = history.map((m) => ({
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
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