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
};

type Contact = {
  nome: string;
  perfil: "frio" | "inativo" | "ativo";
};

type Msg = { sender: "agente" | "cliente"; body: string };

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
}): Promise<string> {
  const { agent, contact, history, servicesContext, isInbound = true, funnelAlreadySent = false, knowledgeExamples = [] } = params;

  const system = [
    `Você é ${agent.agent_name}, atendente humana de um painel SMM. Quando o cliente perguntar seu nome, responda "${agent.agent_name}".`,
    `Tom de voz: ${agent.tone}.`,
    agent.base_instruction,
    `REGRA #1 (ACIMA DE TUDO): SEMPRE responda exatamente o que o cliente perguntou na ÚLTIMA mensagem. Leia a última mensagem do cliente, entenda o que ele quer saber, e responda ISSO. NUNCA mude de assunto, NUNCA solte explicação genérica sobre a plataforma se o cliente não perguntou. Se perguntou seu nome → diga o nome. Se perguntou preço → fale de preço. Se cumprimentou → cumprimente de volta. A resposta precisa fazer sentido para a pergunta atual.`,
    knowledgeExamples.length > 0
      ? `==== BASE DE CONHECIMENTO (REFERÊNCIA DE ESTILO) ====\nExemplos reais de atendimentos do dono do negócio. Use APENAS como referência de TOM, TAMANHO e VOCABULÁRIO — NÃO como respostas prontas.\n\nRegras de uso:\n1. NUNCA copie o conteúdo de um exemplo se ele não responder à pergunta atual do cliente.\n2. NUNCA solte um trecho de exemplo "porque parece encaixar" — só use se a pergunta atual realmente bate com a do exemplo.\n3. Se nenhum exemplo se aplica, IGNORE os exemplos e responda a pergunta com suas próprias palavras, mantendo o tom geral.\n4. A pergunta atual do cliente sempre vence sobre qualquer exemplo.\n\nEXEMPLOS:\n${knowledgeExamples
          .map((ex, i) => `--- Exemplo ${i + 1}${ex.context ? ` — contexto: ${ex.context}` : ""} ---\n${ex.content}`)
          .join("\n\n")}\n==== FIM DA BASE DE CONHECIMENTO ====`
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
        ? `BASE DE CONHECIMENTO INTERNO (FAQ — NÃO É SCRIPT DE RESPOSTA):\n${faqs.map((f) => `- ${f.q} → ${f.a}`).join("\n")}\n\nUse essas informações apenas como conhecimento interno. NUNCA copie ou reproduza o texto do FAQ nas respostas. Responda de forma natural, curta e humana, como se soubesse a informação de cabeça. Máximo 2 linhas por mensagem. Varie as respostas — nunca repita a mesma frase duas vezes seguidas. Se o cliente disse SIM, avance na conversa, não repita a explicação anterior.`
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
    `Regras gerais: pareça humano, nunca diga que é IA, mensagens curtas (máx 2 linhas) salvo se a base de conhecimento mostrar outro padrão, use emojis com moderação.`,
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

export async function transcribeAudioUrl(audioUrl: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");

  const audio = await fetch(audioUrl);
  if (!audio.ok) throw new Error(`Falha ao baixar áudio (${audio.status})`);
  const blob = await audio.blob();
  const mime = blob.type || "audio/ogg";
  const ext =
    mime.includes("mp4") ? "mp4" :
    mime.includes("mpeg") ? "mp3" :
    mime.includes("wav") ? "wav" :
    mime.includes("webm") ? "webm" : "ogg";

  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", blob, `audio.${ext}`);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Transcrição falhou (${res.status}): ${t.slice(0, 300)}`);
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