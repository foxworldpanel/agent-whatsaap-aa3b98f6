// src/lib/agent-v3/orchestrator.server.ts
import { loadEnabledModulesV3, type LoadedModuleV3 } from "./brain/modules.server";
import { selectModulesV3 } from "./selector/module-selector.server";
import { buildPromptFromModulesDetailed } from "./prompt/prompt-builder.server";
import { callAnthropicV3, extractAnthropicTextV3 } from "./integrations/llm-client.server";
import {
  sanitizeSystemLeaks,
  limitEmojiFrequency,
  detectVerboseLoop,
  humanizePunctuationV3,
  stripMarkdownFormattingV3,
} from "./brain/guards.server";
import { autoSplitLongPartsV3 } from "./integrations/audio-processor.server";
import { isConfirmedPurchaseMessage } from "./memory/customer-memory.server";

export interface OrchestratorInput {
  userId: string;
  message: string;
  history: Array<{ role: "agent" | "customer"; content: string }>;
  historyTelemetry?: {
    total_messages_stored: number;
    history_truncated: boolean;
    session_reset_reason?: string;
    oldest_message_sent_at?: string;
  };
  enabledModules?: string[];
  customModules?: Record<string, string | LoadedModuleV3>;
  anthropicApiKey: string;
  extraContext?: string;
  customerLifecycle?: "novo_lead" | "interessado" | "negociacao" | "pronto_para_comprar" | "cliente" | "cliente_recorrente";
  repurchasePotential?: "baixo" | "medio" | "alto";
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
  imageSource?: {
    url?: string;
    data?: string;
    mediaType?: string;
  };
  messageId?: string; // Para telemetria
  workspaceId?: string;
  conversationId?: string;
  phone?: string;
}

export interface ModuleTelemetry {
  key: string;
  name: string;
  chars: number;
  tokens: number;
}

export interface AgentV3TurnResult {
  response: string;
  replies: string[];
  usage: {
    model: string;
    request_id?: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    latency_ms: number;
  };
  cost: {
    input_usd: number;
    output_usd: number;
    cache_usd: number;
    total_usd: number;
  };
  modules: {
    selected_keys: string[];
    versions: Record<string, number>;
    estimated_tokens_by_module: Record<string, number>;
    estimated_chars_by_module: Record<string, number>;
    prompt_tokens_without_commercial: number;
    prompt_tokens_with_commercial: number;
    commercial_tokens_added: number;
    selection_context?: unknown;
    selection_reasons?: Record<string, string>;
  };
  intelligence: {
    temperature: "frio" | "morno" | "quente";
    confidence: string;
    intent: string;
    stage: string;
    purchase_probability: number;
    sentiment: string;
    urgency: string;
    recommended_action: string;
    reasoning: string;
  };
  score?: {
    total?: number;
    humanity?: number;
    clarity?: number;
    conversion?: number;
    persona?: number;
    objectivity?: number;
  };
  rawResponse?: string;
  rawPrompt?: unknown;
}

export type AgentResponseV3 = AgentV3TurnResult;

/**
 * CORE ORCHESTRATOR V3
 * Responsável por:
 * 1. Resolver workspace e carregar módulos do CMS
 * 2. Selecionar módulos relevantes com contexto
 * 3. Construir o system prompt
 * 4. Chamar o LLM
 * 5. Aplicar guards, pós-processamento e telemetria
 */
export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentV3TurnResult> {
  const {
    userId,
    message,
    history,
    historyTelemetry,
    enabledModules,
    customModules,
    anthropicApiKey,
    extraContext,
    customerLifecycle,
    repurchasePotential,
    inputKind,
    imageSource,
    messageId,
    workspaceId: inputWorkspaceId,
    conversationId,
    phone,
  } = input;

  const workspaceId = inputWorkspaceId?.trim();
  if (!workspaceId) {
    throw new Error("[agent-v3] workspaceId é obrigatório; o V3 não usa fallback entre workspaces");
  }


  // 1. Carregar módulos do CMS e aplicar overrides explícitos do chamador.
  const activeModulesMap = await loadEnabledModulesV3(workspaceId);
  const mergedModulesMap: Record<string, LoadedModuleV3> = { ...activeModulesMap };
  for (const [rawKey, customModule] of Object.entries(customModules || {})) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const content = typeof customModule === "string" ? customModule.trim() : customModule.content?.trim();
    if (!content) {
      console.warn(`[agent-v3] Módulo customizado ignorado por estar vazio: ${rawKey}`);
      continue;
    }

    mergedModulesMap[key] =
      typeof customModule === "string"
        ? {
            content,
            source: "custom",
            version: "custom",
            routing: {
              alwaysLoad: false,
              intents: [],
              stages: [],
              platforms: [],
              products: [],
              triggers: [],
              dependencies: [],
              conflicts: [],
              priority: 0,
            },
          }
        : { ...customModule, content, source: "custom" };
  }

  // 2. Respeitar o filtro explícito sem permitir chaves inexistentes.
  const availableKeys = Object.keys(mergedModulesMap);
  const enabledKeys = enabledModules?.length
    ? Array.from(
        new Set(
          enabledModules
            .map((key) => key.trim().toLowerCase())
            .filter((key) => availableKeys.includes(key)),
        ),
      )
    : availableKeys;

  // 3. Selecionar módulos relevantes baseados na mensagem e histórico
  const selectableModules = Object.fromEntries(
    enabledKeys.map((key) => [key, mergedModulesMap[key]]).filter(([, module]) => Boolean(module)),
  );
  const selection = selectModulesV3(message, history, selectableModules);
  const selectedKeys = selection.selectedModules;
  if (selectedKeys.length === 0) {
    throw new Error(
      "[agent-v3] Nenhum módulo foi selecionado. Aplique a migration de roteamento e configure os metadados no CMS.",
    );
  }
  const selectionContext = selection.context;
  const selectionReasons = selection.selectionReasons;

  console.log(
    `[AGENT-V3-SELECTOR] Intent: ${selectionContext.intent}, Stage: ${selectionContext.stage}, Platform: ${selectionContext.platform}, Modules: ${selectedKeys.join(", ")}`,
  );

  // 3.1. Comparativo de Prompt (tokens comerciais)
  const commercialKeys = [
    "psicologia_vendas",
    "objecoes_vendas",
    "fechamento_vendas",
    "recuperacao_leads",
    "qualificacao_lead",
    "fluxo_vendas",
  ];
  const nonCommercialKeys = selectedKeys.filter((k) => !commercialKeys.includes(k));

  const promptWithCommercialResult = buildPromptFromModulesDetailed(selectedKeys, mergedModulesMap);
  const promptWithoutCommercialResult = buildPromptFromModulesDetailed(
    nonCommercialKeys,
    mergedModulesMap,
  );

  if (promptWithCommercialResult.warnings.length > 0) {
    console.warn("[agent-v3] Módulos ignorados durante a montagem do prompt:", promptWithCommercialResult.warnings);
  }

  const promptWithCommercial = promptWithCommercialResult.prompt;
  const promptWithoutCommercial = promptWithoutCommercialResult.prompt;
  const effectiveSelectedKeys = promptWithCommercialResult.includedKeys;

  // A telemetria deve refletir apenas os módulos que realmente entraram no prompt.
  // Chaves descartadas pelo prompt-builder (ausentes ou vazias) não podem aparecer
  // nos tokens estimados, versões ou contagem de módulos usados.
  const modulesTelemetry: ModuleTelemetry[] = effectiveSelectedKeys.map((key) => {
    const mod = mergedModulesMap[key];
    const content = mod?.content || "";
    return {
      key,
      name: mod?.name?.trim() || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      chars: content.length,
      tokens: Math.ceil(content.length / 4),
    };
  });

  if (!promptWithCommercial.trim()) {
    throw new Error("[agent-v3] Os módulos selecionados não produziram conteúdo válido para o prompt");
  }

  const tokensWith = Math.ceil(promptWithCommercial.length / 4);
  const tokensWithout = Math.ceil(promptWithoutCommercial.length / 4);

  const promptComparison = {
    withoutCommercial: tokensWithout,
    withCommercial: tokensWith,
    diff: tokensWith - tokensWithout,
  };

  const modulePrompt = promptWithCommercial;

  const numericModuleVersion = (key: string): number => {
    const parsed = Number(mergedModulesMap[key]?.version);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const isAudioInput = inputKind === "audio";
  const isImageInput = inputKind === "image";
  const isStickerInput = inputKind === "sticker";

  const systemPrompt = [
    {
      type: "text",
      text: `
RESPOSTA AO CLIENTE:
- Gere somente a mensagem que será enviada ao cliente.
- Não escreva metadados, análise interna, score, intenção, temperatura, justificativa ou marcadores entre colchetes.
- Não repita informações já explicadas no histórico, salvo quando forem indispensáveis para responder ao último pedido.
- Prefira 1 a 4 frases curtas. Use lista apenas quando ela realmente facilitar a resposta.

ESTADO DA CONVERSA:
${modulePrompt}


${
  extraContext
    ? `FATO TÉCNICO:
${extraContext}`
    : ""
}

REGRA DE FONTE ÚNICA E ANTI-INVENÇÃO:
- Para preços, serviços, prazos, garantias e regras comerciais, use exclusivamente as informações presentes nos módulos carregados em ESTADO DA CONVERSA.
- A MEMÓRIA COMERCIAL PERSISTENTE pode ser usada para lembrar quem é o cliente, se já comprou, plataforma/serviço anterior e próxima oportunidade; ela NÃO é fonte de preço ou característica do produto.
- Nunca invente, complete por conhecimento próprio ou liste serviços que não estejam escritos nos módulos selecionados.
- Não ofereça nenhuma categoria, plataforma, produto ou serviço que esteja ausente dos módulos carregados.
- Quando o cliente disser apenas "tenho interesse" ou algo vago, pergunte somente qual rede social ou serviço ele procura. Não apresente um catálogo inventado.
- Se a informação não estiver nos módulos, diga que precisa confirmar, sem criar uma resposta.

FORMATAÇÃO PARA WHATSAPP:
- Responda em texto simples. Não use Markdown, asteriscos duplos, títulos com #, crases ou formatação em negrito.

REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.
- Prefira respostas de 1 a 3 frases curtas.
- Não recapitule preço, prazo, garantia, processo ou perguntas anteriores quando o cliente estiver pedindo apenas uma informação pontual.
- Faça no máximo UMA pergunta por mensagem.
- Emoji não é obrigatório. Na maioria das mensagens, não use emoji. Quando fizer sentido, use no máximo 1 e nunca para enfeitar cada frase.

SAUDAÇÃO INICIAL:
- Em uma saudação simples de primeiro contato, não use emoji.
- Responda de forma natural e curta.
- Exemplo de estilo: "Boa noite! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?"
- Preserve o período do cliente: bom dia, boa tarde ou boa noite.
- Evite "Bem-vindo à Mind" e frases publicitárias na saudação.

NATURALIDADE CONVERSACIONAL — PRIORIDADE ALTA:
- Escreva como uma atendente real no WhatsApp, não como chatbot, SAC formal ou roteiro de vendas.
- Não comece repetidamente com "Perfeito!", "Ótimo!", "Legal!", "Claro!" ou "Sem problema!". Muitas respostas podem começar direto pela informação.
- Não transforme toda resposta em pergunta. Se o próximo passo já estiver claro, deixe a conversa respirar.
- Não encerre cada turno com "qualquer dúvida é só chamar", "fico por aqui", "sucesso" ou "boa sorte". Essas frases devem ser raras.
- Não elogie automaticamente uma quantidade, música, link ou informação objetiva.
- Acompanhe levemente a informalidade do cliente ("kkk", "beleza", "blz"), sem caricaturar.
- Pergunta simples merece resposta simples. Explicação longa só quando a dúvida exigir.
- Não repita plataforma, produto, quantidade ou preço em mensagens consecutivas se já estiver claro.
- Não reabra etapa concluída. Se já disse "1000", não pergunte novamente quantos quer.
- Se o cliente disser que vai assistir ao vídeo, conferir o painel ou olhar algo e NÃO fizer pergunta, normalmente não responda.
- "ok", "beleza", "entendi" e reações podem encerrar naturalmente um microtrecho.
- Evite linguagem publicitária artificial como "potencializar" e "bombar" no atendimento individual.
- Prefira "Beleza. 1.000 fica R$ 15." a "Ótimo! Nosso serviço de 1.000 plays sai por R$ 15,00."
- Nunca force simpatia. Ser humano aqui significa ser contextual, breve e útil.

FLUXO COMERCIAL PROGRESSIVO:
- Conduza a conversa um passo por vez: rede/plataforma → serviço → quantidade → valor → pagamento/painel.
- Se o cliente disser apenas que tem interesse, descubra primeiro a rede/plataforma. Não despeje tabela, preços ou catálogo.
- Se o cliente informar somente a plataforma, descubra qual serviço ele procura. Não liste a tabela inteira da plataforma, salvo se ele pedir tabela, preços, valores ou todos os serviços.
- Se o cliente escolher um serviço quantitativo e ainda NÃO informar quantidade, apresente somente o preço base desse serviço quando ele estiver disponível no módulo e pergunte a quantidade desejada.
- Quando o cliente perguntar se pode comprar menos, informe na MESMA resposta a quantidade mínima e o valor correspondente, se ambos puderem ser obtidos com segurança pelos módulos. Depois faça no máximo uma pergunta curta.
- Quando o cliente informar uma quantidade e houver preço proporcional explícito no módulo, calcule o total e avance para o próximo passo.
- Não ofereça serviços de outras redes enquanto o cliente estiver tratando de uma plataforma específica.
- Evite frases burocráticas como "dentro do intervalo disponível" quando essa limitação não tiver sido perguntada nem for necessária.
- O objetivo é parecer uma conversa curta de WhatsApp, não um catálogo ou formulário.

ADIAMENTO E PAUSA NATURAL DA CONVERSA:
- Se o cliente disser que quer divulgar/comprar mais para frente, que está trabalhando, ocupado, sem tempo, que vai ver depois, que chama mais tarde, amanhã, depois de determinado horário ou equivalente, reconheça o adiamento e NÃO faça nova pergunta comercial naquele turno.
- Responda apenas de forma curta e natural, por exemplo: "Sem problema! Quando estiver pronto, é só me chamar." ou "Tranquilo! Depois das 17h a gente continua por aqui."
- Se o cliente informar um horário específico para continuar, mencione esse horário de forma natural, mas não prometa que você irá iniciar contato sozinho naquele horário.
- Não tente recuperar a venda imediatamente depois de o cliente pedir para conversar mais tarde.
- Não pergunte "Como posso te ajudar?", "Qual serviço você procura?" ou equivalente quando a própria mensagem já disser que o cliente quer continuar depois.
- Se o cliente chamar a Júlia por um nome parecido ou errado, como "Juliana", não interrompa a conversa para corrigi-lo. Continue normalmente, salvo se ele perguntar explicitamente o nome.
- Uma saudação dentro de uma conversa já iniciada NÃO deve reiniciar o atendimento nem fazer nova apresentação. Considere o histórico antes de se apresentar novamente.

VENDA CONCLUÍDA E PÓS-VENDA:
- Quando o cliente disser que vai fazer um teste primeiro e aumentar depois se gostar, reconheça isso de forma breve e positiva, sem pressionar a venda.
- Quando o cliente disser "já achei", "já consegui", "ok farei aqui", "pronto fiz", "já comprei" ou equivalente, entenda o avanço da compra e não repita instruções já dadas.
- Se o cliente confirmar que realizou o pedido, considere a venda concluída e entre em modo pós-venda. Não volte a perguntar rede, serviço ou quantidade sem necessidade.
- No pós-venda, responda somente à dúvida atual do cliente e seja ainda mais breve.
- Evite encerramentos repetitivos em mensagens consecutivas como "boa sorte", "sucesso na compra", "fico no aguardo" e "qualquer coisa é só chamar".
- Se o cliente enviar links depois de dizer que comprou, não trate os links como prova de que os pedidos foram realmente criados. Sem confirmação real do sistema, use linguagem condicional, por exemplo: "Se os pedidos já foram feitos no painel, agora é só aguardar o processamento."
- Nunca confirme que um link específico "vai receber" o serviço apenas porque o cliente o enviou.
- Preços, prazos, diferenças entre Global/Premium e características dos serviços DEVEM vir exclusivamente dos módulos carregados.
- Se o módulo do YouTube trouxer Global e Premium, pode apresentar e comparar essas opções conforme o conteúdo cadastrado no módulo, inclusive os respectivos preços. Não invente vantagens, qualidade, engajamento, origem do público ou outras diferenças que não estejam escritas no módulo.
- Se o cliente estiver descontraído ("kkk", brincadeira, agradecimento informal), acompanhe o tom com naturalidade, mantendo a resposta curta. Emoji continua opcional e no máximo 1 quando realmente combinar.

VALIDAÇÃO DE LINKS ENVIADOS PELO CLIENTE:
- Não peça link como pré-requisito da venda. Porém, SE o cliente enviar um link espontaneamente, valide se o tipo do link corresponde ao serviço que já está sendo tratado.
- Spotify Plays/Ouvintes para uma música: o link correto deve ser da faixa (open.spotify.com/track/...). Não oriente usar link de usuário/perfil (/user/) para plays de uma música.
- Spotify Seguidores: use o link do artista (open.spotify.com/artist/...) quando essa for a exigência cadastrada no módulo.
- Spotify Playlist: diferencie link de playlist (/playlist/) de track, artist e user.
- YouTube Visualizações/Likes: se o serviço for para um vídeo específico, confirme que o link enviado aponta para vídeo e não para canal/perfil, salvo se o módulo disser o contrário.
- Se o link estiver incompatível, explique em uma frase qual link o cliente deve copiar. Não invente requisitos fora do módulo.
- Se não houver certeza suficiente para validar o formato, não confirme que o link está correto.

REGRA GERAL DE PAGAMENTO E LINK:
- Sinais como "manda o pix", "qual o pix", "me passa o pix", "quero pagar", "vou pagar", "onde pago" ou equivalentes significam que o cliente quer FECHAR. Pare de qualificar e conduza imediatamente para o procedimento de pagamento descrito nos módulos carregados.
- Se o pagamento da empresa é feito pelo painel conforme os módulos carregados, explique diretamente: acessar o painel, fazer login/cadastro, recarregar saldo via Pix e escolher o serviço. Não peça mais dados antes disso.
- NUNCA peça link de música, vídeo, perfil, postagem ou qualquer outro link como pré-requisito para fechar ou pagar, a menos que um módulo específico diga explicitamente que aquele serviço é exceção.
- O link só deve ser explicado quando o cliente perguntar qual link usar, disser que está com dúvida no campo de link, enviar um link para confirmar, ou quando um módulo específico exigir esse dado naquele momento.
- Quando houver dúvida sobre o link, diga objetivamente qual link corresponde ao serviço usando apenas o módulo da plataforma.
- Depois que o cliente demonstrar intenção clara de pagamento, não volte para etapas anteriores de qualificação.

${isAudioInput ? `MODO ÁUDIO:
- O cliente enviou áudio, mas isso NÃO significa que a resposta também será em áudio.
- Responda normalmente e de forma curta.
- Respostas simples, preços, confirmações e perguntas objetivas devem funcionar bem em texto.
- Quando a dúvida exigir uma explicação maior, várias etapas ou contexto técnico, escreva uma resposta natural que também fique boa se narrada.
- O runtime decide automaticamente se envia texto ou nota de voz.
- Se o áudio estiver ininteligível, peça para enviar novamente ou escrever.` : ""}
${isImageInput ? `MODO VISÃO:
- A imagem real está anexada nesta mensagem.
- Analise a imagem diretamente antes de responder.
- Nunca diga que não consegue visualizar se a imagem foi fornecida.
- Use textos, erros, telas, comprovantes, perfis, postagens ou outros detalhes visíveis para responder no contexto.
- Não invente detalhes que não estejam visíveis.
- Responda de forma curta e natural.` : ""}
${isStickerInput ? `FIGURINHA: Se o cliente mandou figurinha, agradeça ou ignore se não fizer sentido na conversa.` : ""}`,
      cache_control: { type: "ephemeral" }
    },
  ];

  // Não substitua a resposta do LLM por uma mensagem comercial fixa quando houver repetição.
  // O detector apenas adiciona uma orientação de concisão, preservando os módulos do CMS
  // como fonte única e evitando respostas inventadas ou links fora do contexto.
  const verboseLoopDetected =
    history.length > 0 &&
    detectVerboseLoop(
      history.map((m) => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content })),
    );

  if (verboseLoopDetected) {
    console.log("[AGENT-V3-DEBUG] Verbose loop detected for user:", userId);
    systemPrompt.push({
      type: "text",
      text: `ANTI-LOOP:
- Não repita explicações, listas ou chamadas para ação já enviadas.
- Responda apenas ao último pedido do cliente em no máximo 2 frases.
- Não invente link, preço, serviço ou etapa; use somente os módulos carregados.`,
      cache_control: { type: "ephemeral" },
    } as any);
  }

  // Model Call
  const system_prompt_chars = JSON.stringify(systemPrompt).length;
  const history_chars = JSON.stringify(history).length;
  const history_summary =
    history.length > 0
      ? history
          .slice(-3)
          .map((m) => `[${m.role.toUpperCase()}: ${m.content.slice(0, 30)}...]`)
          .join(" | ")
      : "empty";
  const message_chars = message.length;

  const currentUserContent: unknown =
    isImageInput && imageSource
      ? [
          imageSource.data
            ? {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageSource.mediaType || "image/jpeg",
                  data: imageSource.data,
                },
              }
            : {
                type: "image",
                source: {
                  type: "url",
                  url: imageSource.url,
                },
              },
          {
            type: "text",
            text:
              message && message !== "[imagem recebida]"
                ? message
                : "Analise a imagem enviada e responda de acordo com o contexto da conversa.",
          },
        ]
      : message;

  const model = isImageInput ? "claude-sonnet-5" : "claude-haiku-4-5";

  const startLlm = Date.now();
  const llmResult = await callAnthropicV3({
    apiKey:
      anthropicApiKey ||
      (typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined),
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: currentUserContent },
    ],
    model,
    metadata: {
      message_id: messageId,
      call_number: 1,
      selectedKeys: effectiveSelectedKeys,
      system_prompt_chars,
      history_chars,
      history_summary,
      message_chars,
      history_telemetry: historyTelemetry,
    },
  });

  const rawText = extractAnthropicTextV3(llmResult);
  if (!rawText) {
    throw new Error("[agent-v3] A Anthropic retornou uma resposta sem conteúdo de texto");
  }
  const latency_ms = Date.now() - startLlm;

  // Calculate cost based on llm-client logic but normalized
  const usageRaw = llmResult.usage || {};
  const input_tokens = usageRaw.input_tokens || 0;
  const output_tokens = usageRaw.output_tokens || 0;
  const cache_creation_input_tokens = usageRaw.cache_creation_input_tokens || 0;
  const cache_read_input_tokens = usageRaw.cache_read_input_tokens || 0;

  const pricing =
    model === "claude-sonnet-5"
      ? { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }
      : { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };

  const input_usd = (input_tokens * pricing.input) / 1_000_000;
  const output_usd = (output_tokens * pricing.output) / 1_000_000;
  const cache_write_usd = (cache_creation_input_tokens * pricing.cacheWrite) / 1_000_000;
  const cache_read_usd = (cache_read_input_tokens * pricing.cacheRead) / 1_000_000;
  const cache_usd = cache_write_usd + cache_read_usd;
  const total_usd = input_usd + output_usd + cache_usd;

  // A inteligência comercial é derivada do contexto já calculado pelo selector.
  // Isso evita pagar tokens de saída para o LLM gerar metadados que nunca são enviados ao cliente.
  const intentMap: Record<string, string> = {
    saudacao: "Saudação",
    descoberta: "Informação",
    consulta_preco: "Pesquisa",
    compra: "Compra",
    duvida_seguranca: "Informação",
    pagamento: "Pagamento",
    suporte: "Suporte",
    pos_compra: "Pós-venda",
    recuperacao: "Pós-venda",
    encerramento: "Outro",
    desconhecido: "Outro",
  };
  const stageMap: Record<string, string> = {
    inicio: "Primeiro contato",
    qualificacao: "Qualificação",
    apresentacao: "Descoberta",
    negociacao: "Negociação",
    fechamento: "Fechamento",
    pos_venda: "Pós-venda",
    suporte: "Pós-venda",
  };
  const confidence =
    selectionContext.confidence >= 0.85
      ? "Muito alta"
      : selectionContext.confidence >= 0.7
        ? "Alta"
        : selectionContext.confidence >= 0.55
          ? "Média"
          : selectionContext.confidence >= 0.4
            ? "Baixa"
            : "Muito baixa";

  let purchase_probability = 20;
  if (selectionContext.intent === "consulta_preco") purchase_probability = 50;
  if (selectionContext.intent === "compra") purchase_probability = selectionContext.hasQuantity ? 80 : 70;
  if (selectionContext.intent === "pagamento") purchase_probability = 90;
  if (selectionContext.hasPaidSignal) purchase_probability = 95;
  if (selectionContext.intent === "suporte" || selectionContext.intent === "pos_compra") purchase_probability = 25;

  // A inteligência deve refletir a jornada acumulada, não apenas a última frase.
  // Ex.: depois de Spotify + Plays + 1000 + instrução de painel, um "Ok" não
  // transforma o lead novamente em frio.
  if (
    selectionContext.platform &&
    selectionContext.product &&
    selectionContext.hasQuantity &&
    selectionContext.intent !== "suporte" &&
    selectionContext.intent !== "pos_compra"
  ) {
    purchase_probability = Math.max(purchase_probability, 78);
  }
  if (selectionContext.hasPaymentSignal && selectionContext.intent !== "suporte") {
    purchase_probability = Math.max(purchase_probability, 90);
  }

  const purchaseConfirmedThisTurn = isConfirmedPurchaseMessage(message);
  const isExistingCustomer =
    customerLifecycle === "cliente" ||
    customerLifecycle === "cliente_recorrente" ||
    purchaseConfirmedThisTurn;

  if (isExistingCustomer) {
    purchase_probability = 100;
  }

  const temperature: "frio" | "morno" | "quente" =
    isExistingCustomer
      ? "quente"
      : purchase_probability >= 75
        ? "quente"
        : purchase_probability >= 40
          ? "morno"
          : "frio";
  const intent = isExistingCustomer
    ? "Pós-venda"
    : intentMap[selectionContext.intent] || "Outro";
  const stage = isExistingCustomer
    ? "Pós-venda"
    : stageMap[selectionContext.stage] || "Descoberta";
  const normalizedCustomerMessage = message.toLocaleLowerCase("pt-BR");
  const sentiment = /(?:problema|erro|golpe|atras|não chegou|nao chegou|reclama|ruim|péssim|pessim)/i.test(normalizedCustomerMessage)
    ? "Negativo"
    : /(?:obrigad|valeu|ótimo|otimo|perfeito|show|top)/i.test(normalizedCustomerMessage)
      ? "Positivo"
      : "Neutro";
  const urgency = selectionContext.hasPaymentSignal || selectionContext.hasPaidSignal ? "Alta" : selectionContext.hasPurchaseSignal ? "Média" : "Baixa";
  const recommended_action =
    isExistingCustomer
      ? `Atender como cliente existente. Potencial de recompra: ${repurchasePotential || "não definido"}. Não reiniciar qualificação.`
      : selectionContext.intent === "pagamento"
      ? "Orientar o pagamento usando apenas as informações do módulo carregado."
      : selectionContext.intent === "compra"
        ? "Conduzir para o próximo passo da compra sem repetir informações."
        : selectionContext.intent === "suporte"
          ? "Resolver a dúvida de suporte com objetividade."
          : "Responder diretamente ao último pedido do cliente.";
  const reasoning = isExistingCustomer
    ? purchaseConfirmedThisTurn
      ? `Compra confirmada nesta mensagem; contexto atual ${selectionContext.intent}/${selectionContext.stage}.`
      : `Memória comercial persistente: ${customerLifecycle}; contexto atual ${selectionContext.intent}/${selectionContext.stage}.`
    : `Contexto derivado pelo selector: ${selectionContext.intent}/${selectionContext.stage}.`;
  const conversation_score = Math.max(0, Math.min(100, Math.round(selectionContext.confidence * 100)));

  // Guards & Pipeline
  let finalContent = rawText.trim();
  if (!finalContent) {
    throw new Error("[agent-v3] A Anthropic retornou uma resposta vazia");
  }
  finalContent = sanitizeSystemLeaks(finalContent);

  // Emoji handling
  const agentHistory = history.map((m) => ({
    sender: m.role === "agent" ? "agente" : "cliente",
    body: m.content,
  }));
  finalContent = limitEmojiFrequency(finalContent, agentHistory);

  // Post-processing
  finalContent = humanizePunctuationV3(finalContent);
  finalContent = stripMarkdownFormattingV3(finalContent).trim();

  if (!finalContent) {
    throw new Error(
      "[agent-v3] A resposta ficou vazia após os filtros de segurança e formatação",
    );
  }

  // Primeiro contato: padroniza a saudação aprovada e elimina variações
  // excessivas do LLM como "Bem-vindo" ou emoji de mão.
  const greetingOnly =
    /^(?:oi|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s*a[ií]|opa)[!.?\s]*$/i.test(
      message.trim(),
    );
  const isFirstTurn = history.length === 0;

  if (greetingOnly && isFirstTurn) {
    const normalizedGreeting = message.trim().toLocaleLowerCase("pt-BR");
    const greeting =
      normalizedGreeting.includes("bom dia")
        ? "Bom dia"
        : normalizedGreeting.includes("boa tarde")
          ? "Boa tarde"
          : normalizedGreeting.includes("boa noite")
            ? "Boa noite"
            : "Olá";

    finalContent = `${greeting}! Tudo bem? Aqui é a Júlia da Mind. Como posso te ajudar?`;
  }

  // Auto-split logic
  const replies = autoSplitLongPartsV3(finalContent);

  const result = {
    response: finalContent,
    replies,
    intelligence: {
      temperature,
      confidence,
      intent,
      stage,
      purchase_probability,
      sentiment,
      urgency,
      recommended_action,
      reasoning,
    },
    score: {
      total: conversation_score,
      // humanity, clarity etc are derived from feedback or expanded in extractor later
    },
    usage: {
      model,
      request_id: llmResult.request_id || "unknown", // Adjust if llmResult has it differently
      input_tokens,
      output_tokens,
      cache_creation_input_tokens,
      cache_read_input_tokens,
      latency_ms,
    },
    cost: {
      input_usd,
      output_usd,
      cache_usd,
      total_usd,
    },
    modules: {
      selected_keys: effectiveSelectedKeys,
      versions: Object.fromEntries(
        effectiveSelectedKeys.map((key) => [key, numericModuleVersion(key)]),
      ),
      estimated_tokens_by_module: Object.fromEntries(
        modulesTelemetry.map((m) => [m.key, m.tokens]),
      ),
      estimated_chars_by_module: Object.fromEntries(
        modulesTelemetry.map((m) => [m.key, m.chars]),
      ),
      prompt_tokens_without_commercial: promptComparison.withoutCommercial,
      prompt_tokens_with_commercial: promptComparison.withCommercial,
      commercial_tokens_added: promptComparison.diff,
      selection_context: selectionContext,
      selection_reasons: selectionReasons,
    },
    rawResponse: rawText,
    rawPrompt: systemPrompt,
  };

  try {
    const { logEvent } = await import("@/lib/agent-logger.server");
    await logEvent({
      userId,
      workspaceId,
      phone: phone ?? null,
      conversationId: conversationId ?? null,
      type: "agent_v3_turn",
      level: "info",
      summary: `V3 respondeu com ${effectiveSelectedKeys.length} módulos`,
      prompt: JSON.stringify(result.rawPrompt),
      response: result.rawResponse || result.response,
      durationMs: result.usage.latency_ms,
      metadata: {
        message_id: messageId ?? null,
        selected_modules: effectiveSelectedKeys,
        selection_context: selectionContext,
        selection_reasons: selectionReasons,
        usage: result.usage,
        cost: result.cost,
        intelligence: result.intelligence,
        history_telemetry: historyTelemetry ?? null,
      },
    });
  } catch (err) {
    console.error("[agent-v3] Failed to log production telemetry:", err);
  }

  return result;
}
