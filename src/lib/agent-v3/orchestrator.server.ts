// src/lib/agent-v3/orchestrator.server.ts
import { loadEnabledModulesV3, type LoadedModuleV3 } from "./brain/modules.server";
import { selectModulesV3 } from "./selector/module-selector.server";
import { buildPromptFromModulesDetailed } from "./prompt/prompt-builder.server";
import { callAnthropicV3, extractAnthropicTextV3 } from "./integrations/llm-client.server";
import { extractMetadataV3 } from "./memory/metadata-extractor.server";
import {
  sanitizeSystemLeaks,
  limitEmojiFrequency,
  detectVerboseLoop,
  humanizePunctuationV3,
  stripMarkdownFormattingV3,
} from "./brain/guards.server";
import { autoSplitLongPartsV3 } from "./integrations/audio-processor.server";

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
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
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
    inputKind,
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
LEAD INTELLIGENCE (Obrigatório em toda resposta):
Sempre inclua os seguintes marcadores no INÍCIO da sua resposta (antes do texto):
[TEMP:frio|morno|quente]
[CONF:Muito baixa|Baixa|Média|Alta|Muito alta]
[INTENT:Saudação|Informação|Pesquisa|Comparação|Compra|Suporte|Pagamento|Pós-venda|Reclamação|Outro]
[STAGE:Primeiro contato|Descoberta|Qualificação|Negociação|Objeções|Fechamento|Pós-venda]
[PROB:0-100]
[SENT:Positivo|Neutro|Negativo]
[URG:Baixa|Média|Alta]
[ACTION:Ação recomendada]
[REASON:Justificativa curta]
[SCORE:0-100] (Avaliação da qualidade da resposta)
[FEEDBACK:Item 1|Item 2|...] (Lista de pontos positivos/negativos separados por |)


ESTADO DA CONVERSA:
${modulePrompt}


${
  extraContext
    ? `FATO TÉCNICO:
${extraContext}`
    : ""
}

REGRA DE FONTE ÚNICA E ANTI-INVENÇÃO:
- Use exclusivamente as informações presentes nos módulos carregados em ESTADO DA CONVERSA.
- Nunca invente, complete por conhecimento próprio ou liste serviços que não estejam escritos nos módulos selecionados.
- Não ofereça nenhuma categoria, plataforma, produto ou serviço que esteja ausente dos módulos carregados.
- Quando o cliente disser apenas "tenho interesse" ou algo vago, pergunte somente qual rede social ou serviço ele procura. Não apresente um catálogo inventado.
- Se a informação não estiver nos módulos, diga que precisa confirmar, sem criar uma resposta.

FORMATAÇÃO PARA WHATSAPP:
- Responda em texto simples. Não use Markdown, asteriscos duplos, títulos com #, crases ou formatação em negrito.

REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.

${isAudioInput ? `MODO ÁUDIO: O cliente enviou áudio. Responda de forma curta, natural e adequada para ser narrada em áudio. Se o áudio estiver ininteligível, peça para enviar novamente ou escrever.` : ""}
${isImageInput ? `IMAGEM: Se o cliente mandou imagem, avise que não consegue ver no momento e peça para descrever.` : ""}
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
      { role: "user", content: message },
    ],
    model: "claude-haiku-4-5",
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

  const input_usd = (input_tokens * 1) / 1_000_000;
  const output_usd = (output_tokens * 5) / 1_000_000;
  const cache_write_usd = (cache_creation_input_tokens * 1.25) / 1_000_000;
  const cache_read_usd = (cache_read_input_tokens * 0.1) / 1_000_000;
  const cache_usd = cache_write_usd + cache_read_usd;
  const total_usd = input_usd + output_usd + cache_usd;

  // Metadata extraction
  const {
    temperature,
    confidence,
    intent,
    stage,
    purchase_probability,
    sentiment,
    urgency,
    recommended_action,
    reasoning,
    conversation_score,
    text: cleanText,
  } = extractMetadataV3(rawText);

  // Guards & Pipeline
  let finalContent = cleanText;
  if (!finalContent.trim()) {
    throw new Error(
      "[agent-v3] A resposta da Anthropic continha somente metadados internos e nenhum texto para o cliente",
    );
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
      model: "claude-haiku-4-5",
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
