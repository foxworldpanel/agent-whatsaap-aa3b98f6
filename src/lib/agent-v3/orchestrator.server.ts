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
  historyTelemetry?: { total_messages_stored: number, history_truncated: boolean, session_reset_reason?: string, oldest_message_sent_at?: string };
  enabledModules?: string[];
  customModules?: Record<string, string>;
  anthropicApiKey: string;
  extraContext?: string;
  isInbound?: boolean;
  inputKind?: "texto" | "audio" | "image" | "sticker";
  messageId?: string; // Para telemetria
}

export interface AgentResponseV3 {
  temperature: "frio" | "morno" | "quente";
  confidence: string;
  intent: string;
  stage: string;
  purchase_probability: number;
  sentiment: string;
  urgency: string;
  recommended_action: string;
  reasoning: string;
  conversation_score: number;
  conversation_feedback: string[];
  replies: string[];


  rawResponse?: string;
  rawPrompt?: any;
  usage?: any;
  selectedModules: string[];
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
  const { userId, message, history, historyTelemetry, enabledModules, customModules, anthropicApiKey, extraContext, isInbound = true, inputKind, messageId } = input;

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

  const isAudioInput = inputKind === "audio";
  const isImageInput = inputKind === "image";
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
- RECONHECIMENTO DE TERMOS (Rede Spotify): 'plays', 'streams', 'ouvintes' e 'saves' são termos EXCLUSIVOS do Spotify. Se o cliente usá-los, a rede está CONFIRMADA como Spotify. NUNCA pergunte 'qual rede' nestes casos.
- Considere a rede já confirmada quando ela vier informada pelos metadados ou pelo contexto.
- NUNCA mencione que a sessão foi reiniciada, que o histórico foi apagado ou que você esqueceu conversas anteriores. Responda naturalmente como se fosse o primeiro contato caso o histórico esteja vazio.
- Perguntas indicam interesse, não recusa.
- Após o cliente confirmar uma oferta já apresentada, avance para o fechamento e envie mindsmmpanel.com.

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
[SCORE:0-100] (Avaliação da qualidade da resposta da Júlia)
[FEEDBACK:Item 1|Item 2|...] (Lista de pontos positivos/negativos separados por |)


ESTADO DA CONVERSA:
${modulePrompt}


IDENTIDADE E PERSONA:
${identity.persona}

REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.

${hasIntentSupport ? `SUPORTE: Se houver pedido existente ou intenção de suporte, priorize suporte e não reinicie o funil.` : ""}
REGRAS DE SUPORTE PÓS-COMPRA:
- Se o cliente mencionar: pedido, número do pedido, queda, reposição, atraso, serviço não iniciado, saldo, recarga, pagamento já realizado ou problemas técnicos;
- Classifique como INTENT:Suporte ou Pós-venda;
- NÃO tente resolver ou consultar status no WhatsApp;
- Oriente o cliente a acessar mindsmmpanel.com e abrir um TICKET no suporte;
- Mantenha a resposta curta, humana e não prometa prazos ou reposições aqui.


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
      confidence: "Baixa",
      intent: "suporte",
      stage: "lead",
      purchase_probability: 0,
      sentiment: "Neutro",
      urgency: "Média",
      recommended_action: "Finalizar atendimento",
      reasoning: "Loop detectado",
      conversation_score: 100,
      conversation_feedback: ["Segurança ativada"],
      replies: ["Pra finalizar rapidinho seu pedido, é só acessar mindsmmpanel.com e criar sua conta, leva menos de 1 minuto! Lá você vê todos os preços e serviços atualizados."],

      rawPrompt: systemPrompt,
      selectedModules: moduleKeys
    };

  }

  // Model Call
  const system_prompt_chars = JSON.stringify(systemPrompt).length;
  const history_chars = JSON.stringify(history).length;
  const history_summary = history.length > 0 
    ? history.slice(-3).map(m => `[${m.role.toUpperCase()}: ${m.content.slice(0, 30)}...]`).join(" | ")
    : "empty";
  const message_chars = message.length;

  const response = await callAnthropicV3({
    apiKey: anthropicApiKey,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({
        role: m.role === "agent" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: message }
    ],
    model: "claude-haiku-4-5",
    metadata: {
      message_id: messageId,
      call_number: 1,
      selectedKeys: moduleKeys,
      system_prompt_chars,
      history_chars,
      history_summary,
      message_chars,
      history_telemetry: historyTelemetry
    }
  });
  
  // Instrumentação detalhada no orchestrator para capturar selectedKeys
  console.log("[RUNTIME-REAL-LOG-KEYS]", JSON.stringify({
    selectedKeys: moduleKeys
  }));

  const rawText = response.content[0].text;
  console.log("[AGENT-V3-DEBUG] Raw response:", rawText);
  
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

  return {
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
    replies,


    rawResponse: rawText,
    rawPrompt: systemPrompt,
    usage: response.usage,
    selectedModules: moduleKeys
  };
}
