// src/lib/agent-v3/orchestrator.server.ts
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { loadAgentConfigV3 } from "./config.server";
import { selectRelevantModules, buildPromptFromModules } from "./module-selector.server";
import { callAnthropicV3 } from "./llm-client.server";
import { extractMetadataV3 } from "./metadata-extractor.server";
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
  enabledModules?: string[];
  customModules?: Record<string, string>;
  anthropicApiKey: string;
  extraContext?: string;
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
}

export interface AgentResponseV3 {
  temperature: "frio" | "morno" | "quente";
  intent: string;
  stage: string;
  replies: string[];
  rawResponse?: string;
  rawPrompt?: any;
  usage?: any;
}

/**
 * CORE ORCHESTRATOR V3
 * Responsável por:
 * 1. Carregar configuração e identidade
 * 2. Selecionar módulos relevantes (Router Determinístico)
 * 3. Construir system prompt com cache e breakpoint
 * 4. Chamar o LLM (Haiku 4.5)
 * 5. Aplicar Guards e Pós-processamento
 */
export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentResponseV3> {
  const { userId, message, history, enabledModules, customModules, anthropicApiKey, extraContext, isInbound = true, inputKind } = input;

  // Carrega Identidade e Configuração dinamicamente
  const targetUserId = userId;
  const identity = await loadAgentIdentity(targetUserId);
  const config = await loadAgentConfigV3(targetUserId);

  // Se enabledModules não foi passado (padrão legado), usa os do banco
  const activeModules = enabledModules && enabledModules.length > 0 
    ? enabledModules 
    : Object.entries(config.modules_enabled)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);

  const moduleKeys = selectRelevantModules(message, activeModules);
  
  // Prioritize DB content (config.brand_blocks) as customModules
  const dbModules = config.brand_blocks || {};
  const modulePrompt = buildPromptFromModules(moduleKeys, { ...dbModules, ...(customModules || {}) });

  // V3 ORCHESTRATOR - SYSTEM PROMPT CONSTRUCTION
  console.log("[AGENT-V3-DEBUG] targetUserId:", targetUserId);
  // V3 ORCHESTRATOR - SYSTEM PROMPT CONSTRUCTION
  console.log("[AGENT-V3-DEBUG] targetUserId:", targetUserId);

  const isAudioInput = inputKind === "audio" || message.toLowerCase().includes("[audio]") || message.toLowerCase().includes("[transcrição]");
  const isImageInput = inputKind === "image" || message.toLowerCase().includes("[imagem]") || message.toLowerCase().includes("[foto]");
  const isStickerInput = inputKind === "sticker";
  const hasIntentSupport = moduleKeys.includes("suporte");

  const systemPrompt = [
    { 
      type: "text", 
      text: `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.

REGRAS DE OURO:
- Responda de forma humana, natural, curta e no idioma do cliente.
- Nunca invente informações, preços, serviços, redes ou provas sociais. Quando faltar um dado necessário, pergunte.
- Considere a rede já confirmada quando ela vier informada pelos metadados ou pelo contexto.
- Perguntas indicam interesse, não recusa.
- Após o cliente confirmar uma oferta já apresentada, avance para o fechamento e envie mindsmmpanel.com.

ESTADO DA CONVERSA:
${modulePrompt}

IDENTIDADE E PERSONA:
${identity.persona}

REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.

${hasIntentSupport ? `SUPORTE: Se houver pedido existente ou intenção de suporte, priorize suporte e não reinicie o funil.` : ""}

${isAudioInput ? `MODO ÁUDIO: Se o input for áudio, seja compreensiva. ÁUDIO ININTELIGÍVEL: Peça para escrever ou mandar de novo se não entender. PROIBIDO imitar o tom.` : ""}

${isImageInput ? `IMAGEM: Se o cliente mandou imagem, avise que não consegue ver no momento e peça para descrever.` : ""}
${isStickerInput ? `FIGURINHA: Se o cliente mandou figurinha, agradeça ou ignore se não fizer sentido na conversa.` : ""}

${extraContext ? `FATO TÉCNICO: ${extraContext}` : ""}`,
    }
  ];

  // Verbose Loop Check
  if (detectVerboseLoop(history.map(m => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content })))) {
    return {
      temperature: "frio",
      intent: "suporte",
      stage: "lead",
      replies: ["Pra finalizar rapidinho seu pedido, é só acessar mindsmmpanel.com e criar sua conta, leva menos de 1 minuto! Lá você vê todos os preços e serviços atualizados."],
      rawPrompt: systemPrompt
    };
  }

  // Model Call
  console.log("[AGENT-V3-INSTRUMENTATION] [BEFORE_CALL] time:", Date.now());
  console.log("[AGENT-V3-INSTRUMENTATION] [PROMPT_INFO]", {
    system_prompt_chars: JSON.stringify(systemPrompt).length,
    moduleKeys,
    history_count: history.length,
    message_chars: message.length
  });

  const response = await callAnthropicV3({
    apiKey: anthropicApiKey,
    system: systemPrompt,
    messages: [
      ...history.slice(-10).map(m => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: message }
    ],
    model: "claude-haiku-4-5"
  });
  
  // Instrumentação detalhada no orchestrator para capturar selectedKeys
  console.log("[RUNTIME-REAL-LOG-KEYS]", JSON.stringify({
    selectedKeys: moduleKeys
  }));

  const rawText = response.content[0].text;
  console.log("[AGENT-V3-DEBUG] Raw response:", rawText);
  
  // Metadata extraction
  const { temperature, intent, stage, text: cleanText } = extractMetadataV3(rawText);

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

  return {
    temperature,
    intent,
    stage,
    replies,
    rawResponse: rawText,
    rawPrompt: systemPrompt,
    usage: response.usage
  };
}
