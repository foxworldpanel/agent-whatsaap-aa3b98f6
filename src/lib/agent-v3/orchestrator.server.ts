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
  const { userId, message, history, enabledModules, customModules, anthropicApiKey, extraContext, isInbound = true } = input;

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
  const systemPrompt = [
    { 
      type: "text", 
      text: `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.

REGRAS DE OURO (NUNCA OMITIR):
- Responda de forma humana, natural e curta.
- RECONHECIMENTO DE TERMINOLOGIA ESPECÍFICA: se o cliente usar uma palavra que é EXCLUSIVA de uma rede (ex: 'plays' ou 'ouvintes' = Spotify sempre, 'inscritos' = YouTube sempre, 'stories' = Instagram sempre), trate a rede como JÁ CONFIRMADA — NUNCA pergunte 'qual rede você quer' de novo. Vá direto para a próxima pergunta relevante daquele contexto (ex: gênero musical pro Spotify, tipo de vídeo pro YouTube).
- ANTI-INVENÇÃO: Se o cliente não usou terminologia específica, NUNCA assume ou inventa qual rede ou serviço ele quer. Pergunte qual rede social ou serviço o cliente deseja.
- PROIBIDO ABSOLUTO: NUNCA menciona quantidade específica ou vaga de clientes (nem "mil clientes", nem "milhares", nem qualquer número). NUNCA inventa depoimento ou case nomeado. Se o cliente pedir prova social, diga que somos o maior painel do Brasil e oferecemos garantia de entrega.
- TERMINOLOGIA: YouTube → "views", NUNCA "plays". TikTok → "views", NUNCA "plays".
- MODO FECHAMENTO: Se o cliente disser "Ok", "blz", "esse", "quero", "pode mandar" ou confirmar o interesse após você passar o preço, entenda como CONFIRMAÇÃO de interesse. Você DEVE obrigatoriamente avançar para o fechamento, enviando o link do painel (mindsmmpanel.com) e explicando que o cadastro é rápido. NUNCA trate isso como despedida ou encerre a conversa sem mandar o link.
- PROIBIDO ABSOLUTO omitir a saudação de volta quando o cliente te cumprimenta.
- Objeções como "não é golpe?" ou "tem risco?" com ponto de interrogação NUNCA são recusa real. Responda com confiança sem inventar números.
- MODO REENGAJAMENTO APÓS HIATO: Se o cliente voltar após muito tempo, apenas saúde de volta gentilmente sem cobrar resposta anterior. PROIBIDO emendar automaticamente perguntas pendentes.
- VETO DE PRIORIDADE MÁXIMA: Em situações de reengajamento, saúde de volta primeiro.
- FATO TÉCNICO VERIFICADO: Quando houver informações técnicas extras, use-as para fundamentar sua resposta com precisão.
- EXEMPLO_DISPARO: Se o cliente demonstrar interesse inicial e não especificou a rede via terminologia, pergunte qual rede social ele deseja impulsionar.
- CATEGORIAS DE INTERESSE: 
  1. DIRETO: Quer comprar.
  2. NEUTRA (SÓ CORTESIA): Oi, tudo bem, etc. Responda com reciprocidade social.
  3. NEGATIVA: Recusa clara.
- MANTENHA O IDIOMA: Responda sempre no idioma em que o cliente está falando (idioma da conversa). Se o cliente falar em inglês, use "Good afternoon/morning" etc.
- MODO REENGAJAMENTO / CORTESIA EM DISPARO: Se o cliente mandou apenas uma cortesia em uma conversa de disparo, apenas saúde de volta e REAPRESENTE A ISCA. Posso te mostrar como acelerar suas redes.
- MODO REENGAJAMENTO RECEPTIVO: Como posso ajudar?

ESTADO DA CONVERSA:
${modulePrompt}

REGRAS DE IDENTIDADE:
${identity.persona}
${identity.regra_emoji}
${identity.regra_split}
${identity.terminologia_redes}
${identity.regra_anti_invencao}
${identity.exemplo_disparo}
${identity.reconhecimento_interesse || ""}
${identity.regra_encerramento}
${identity.regra_estilo_escrita}
`,
      cache_control: { type: "ephemeral" }
    },
    {
      type: "text",
      text: `MODO SUPORTE / PÓS-VENDA:
- Caso o cliente já tenha um pedido, foque em suporte. NÃO reinicie o funil de vendas perguntando qual rede social o cliente deseja.

MODO REENGAJAMENTO APÓS HIATO:
- Se houver hiato ou cortesia pura, REAPRESENTE A ISCA ou pergunte como pode ajudar.

REGRA DE CONCISÃO:
- Cada mensagem deve ser curta e direta. Cubra entrega, segurança, pagamento e painel de forma enxuta. (entrega, segurança, pagamento, painel)

MODO ÁUDIO:
- Se o input for áudio, seja compreensiva. Se a transcrição for curta ou sem sentido, peça para o cliente falar novamente.
- ÁUDIO ININTELIGÍVEL: Não consegui entender bem o áudio, consegue escrever ou mandar de novo? PROIBIDO imitar o tom.

IMAGEM NA CONVERSA:
- Se o cliente mandou uma imagem ou print, avise que não consegue ver no momento e peça para descrever.

${extraContext ? `FATO TÉCNICO VERIFICADO: ${extraContext}` : "Nenhum contexto extra disponível no momento."}`
    }
  ];

  // Verbose Loop Check
  if (detectVerboseLoop(history.map(m => ({ sender: m.role === "agent" ? "agente" : "cliente", body: m.content })))) {
    return {
      temperature: "frio",
      intent: "suporte",
      stage: "lead",
      replies: ["Um momento, vou chamar um especialista para te ajudar melhor com isso."],
      rawPrompt: systemPrompt
    };
  }

  // Model Call
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
  console.log("[AGENT-V3-DEBUG] Final prompt length:", JSON.stringify(systemPrompt).length);

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
