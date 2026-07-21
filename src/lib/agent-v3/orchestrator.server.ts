// src/lib/agent-v3/orchestrator.server.ts
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { loadEnabledModulesV3 } from "./modules.server";
import { selectRelevantModules, buildPromptFromModules } from "./module-selector.server";
import { callAnthropicV3 } from "./llm-client.server";
import { extractMetadataV3 } from "./metadata-extractor.server";
import { GLOBAL_V3_CONFIG } from "./global-config.server";
import { 
  sanitizeSystemLeaks, 
  limitEmojiFrequency, 
  detectVerboseLoop, 
  enforceReengagementGreeting,
  humanizePunctuationV3
} from "./guards.server";
import { autoSplitLongPartsV3 } from "./audio-processor.server";

export interface OrchestratorInput {
  userId: string;
  message: string;
  history: Array<{ role: "agent" | "customer", content: string }>;
  historyTelemetry?: { total_messages_stored: number, history_truncated: boolean, session_reset_reason?: string, oldest_message_sent_at?: string };
  enabledModules?: string[];
  customModules?: Record<string, string>;
  anthropicApiKey: string;
  extraContext?: string;
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
  messageId?: string; // Para telemetria
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
  rawPrompt?: any;
}

export type AgentResponseV3 = AgentV3TurnResult;



/**
 * CORE ORCHESTRATOR V3
 * Responsável por:
 * 1. Carregar configuração e identidade
 * 2. Selecionar módulos relevantes (Router Determinístico)
 * 3. Construir system prompt com cache e breakpoint
 * 4. Chamar o LLM (Haiku 4.5)
 * 5. Aplicar Guards e Pós-processamento
 */
export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentV3TurnResult> {
  const { userId, message, history, historyTelemetry, enabledModules, customModules, anthropicApiKey, extraContext, isInbound = true, inputKind, messageId } = input;

  // Carrega Identidade e Configuração dinamicamente
  const targetUserId = userId;
  const identity = await loadAgentIdentity(targetUserId);
  
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
    
  const workspaceId = ws?.id || "bd59fa41-d68d-4ac8-b995-e09ae48f52aa"; // Mind Default fallback for authorized testing

  // 1. Carregar configuração e módulos do banco (com fallback)
  const activeModulesMap = await loadEnabledModulesV3(workspaceId);
  
  // 2. Identificar módulos habilitados (se enabledModules for passado, filtra o mapa)
  const enabledKeys = enabledModules && enabledModules.length > 0 
    ? enabledModules 
    : Object.keys(activeModulesMap);

  // 3. Selecionar módulos relevantes baseados na mensagem
  const selectedKeys = selectRelevantModules(message, enabledKeys);
  
  // 3.1. Calcular Telemetria de Módulos
  const modulesTelemetry: ModuleTelemetry[] = selectedKeys.map(key => {
    const mod = activeModulesMap[key];
    const content = typeof mod === 'string' ? mod : mod?.content || "";
    return {
      key,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      chars: content.length,
      tokens: Math.ceil(content.length / 4)
    };
  });

  // 3.2. Comparativo de Prompt (tokens comerciais)
  const commercialKeys = ["psicologia_vendas", "objecoes_vendas", "fechamento_vendas", "recuperacao_leads", "qualificacao_lead", "fluxo_vendas"];
  const nonCommercialKeys = selectedKeys.filter(k => !commercialKeys.includes(k));
  
  const promptWithCommercial = buildPromptFromModules(selectedKeys, { ...activeModulesMap, ...(customModules || {}) } as any);
  const promptWithoutCommercial = buildPromptFromModules(nonCommercialKeys, { ...activeModulesMap, ...(customModules || {}) } as any);

  
  const tokensWith = Math.ceil(promptWithCommercial.length / 4);
  const tokensWithout = Math.ceil(promptWithoutCommercial.length / 4);

  const promptComparison = {
    withoutCommercial: tokensWithout,
    withCommercial: tokensWith,
    diff: tokensWith - tokensWithout
  };

  const modulePrompt = promptWithCommercial;


  const isAudioInput = inputKind === "audio";
  const isImageInput = inputKind === "image";
  const isStickerInput = inputKind === "sticker";

  const hasIntentSupport = selectedKeys.includes("suporte") || selectedKeys.includes("suporte_pos_compra");

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


${extraContext ? `FATO TÉCNICO: ${extraContext}` : ""}


REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.

${extraContext ? `FATO TÉCNICO: ${extraContext}` : ""}

${isAudioInput ? `MODO ÁUDIO: Se o input for áudio, seja compreensiva. ÁUDIO ININTELIGÍVEL: Peça para escrever ou mandar de novo se não entender. PROIBIDO imitar o tom.` : ""}
${isImageInput ? `IMAGEM: Se o cliente mandou imagem, avise que não consegue ver no momento e peça para descrever.` : ""}
${isStickerInput ? `FIGURINHA: Se o cliente mandou figurinha, agradeça ou ignore se não fizer sentido na conversa.` : ""}`,
    }
  ];

  // Verbose Loop Check
  if (history && history.length > 0 && detectVerboseLoop(history.map(m => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content })))) {
    console.log("[AGENT-V3-DEBUG] Verbose loop detected for user:", userId);
    return {
      response: `Pra finalizar rapidinho seu pedido, é só acessar ${GLOBAL_V3_CONFIG.panel_url} e criar sua conta, leva menos de 1 minuto! Lá você vê todos os preços e serviços atualizados.`,
      replies: [`Pra finalizar rapidinho seu pedido, é só acessar ${GLOBAL_V3_CONFIG.panel_url} e criar sua conta, leva menos de 1 minuto! Lá você vê todos os preços e serviços atualizados.`],
      intelligence: {
        temperature: "frio",
        confidence: "Baixa",
        intent: "suporte",
        stage: "lead",
        purchase_probability: 0,
        sentiment: "Neutro",
        urgency: "Média",
        recommended_action: "Finalizar atendimento",
        reasoning: "Loop detectado",
      },
      score: {
        total: 100
      },
      usage: {
        model: "claude-haiku-4-5",
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        latency_ms: 0
      },
      cost: {
        input_usd: 0,
        output_usd: 0,
        cache_usd: 0,
        total_usd: 0
      },
      modules: {
        selected_keys: selectedKeys,
        versions: {},
        estimated_tokens_by_module: {},
        commercial_tokens_added: 0
      },
      rawPrompt: systemPrompt
    };
  }

  // Model Call
  const system_prompt_chars = JSON.stringify(systemPrompt).length;
  const history_chars = JSON.stringify(history).length;
  const history_summary = history.length > 0 
    ? history.slice(-3).map(m => `[${m.role.toUpperCase()}: ${m.content.slice(0, 30)}...]`).join(" | ")
    : "empty";
  const message_chars = message.length;

  const startLlm = Date.now();
  const llmResult = await callAnthropicV3({
    apiKey: anthropicApiKey || (typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : undefined),
    system: systemPrompt,
    messages: [
      ...history.map(m => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: message }
    ],
    model: "claude-3-haiku-20240307",
    metadata: {
      message_id: messageId,
      call_number: 1,
      selectedKeys: selectedKeys,
      system_prompt_chars,
      history_chars,
      history_summary,
      message_chars,
      history_telemetry: historyTelemetry
    }
  });
  
  const rawText = llmResult.content[0].text;
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
  const cache_read_usd = (cache_read_input_tokens * 0.10) / 1_000_000;
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
    conversation_feedback,
    text: cleanText 
  } = extractMetadataV3(rawText);

  // Guards & Pipeline
  let finalContent = cleanText;
  finalContent = sanitizeSystemLeaks(finalContent);
  const reengagement = enforceReengagementGreeting(finalContent, message);
  finalContent = reengagement.text;
  
  // Emoji handling
  const agentHistory = history.map(m => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content }));
  finalContent = limitEmojiFrequency(finalContent, agentHistory);

  // Post-processing
  finalContent = humanizePunctuationV3(finalContent);

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
      total: conversation_score
      // humanity, clarity etc are derived from feedback or expanded in extractor later
    },
    usage: {
      model: "claude-3-haiku-20240307",
      request_id: llmResult.request_id || "unknown", // Adjust if llmResult has it differently
      input_tokens,
      output_tokens,
      cache_creation_input_tokens,
      cache_read_input_tokens,
      latency_ms
    },
    cost: {
      input_usd,
      output_usd,
      cache_usd,
      total_usd
    },
    modules: {
      selected_keys: selectedKeys,
      versions: Object.fromEntries(Object.entries(activeModulesMap).map(([k, v]) => [k, (v as any).version || 1])),
      estimated_tokens_by_module: Object.fromEntries(modulesTelemetry.map(m => [m.key, m.tokens])),
      commercial_tokens_added: promptComparison.diff
    },
    rawResponse: rawText,
    rawPrompt: systemPrompt
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("agent_playground_runs" as any).insert({
      workspace_id: identity.workspaceId || "default",
      agent_id: identity.agentId || "anonymous",
      message: message,
      response: result.response,
      raw_prompt: result.rawPrompt,
      raw_response: result.rawResponse,
      usage: result.usage as any,
      cost: result.cost as any,
      intelligence: result.intelligence as any,
      modules: result.modules.selected_keys
    } as any);
  } catch (err) {
    console.error("[agent-v3] Failed to log playground run:", err);
  }


  return result;
}

