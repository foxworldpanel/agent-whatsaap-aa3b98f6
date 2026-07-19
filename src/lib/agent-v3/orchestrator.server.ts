// src/lib/agent-v3/orchestrator.server.ts
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { selectRelevantModules, buildPromptFromModules } from "./module-selector.server";
import { extractMetadataV3, type AgentResponseV3 } from "./metadata-extractor.server";
import { 
  sanitizeSystemLeaks, 
  limitEmojiFrequency, 
  enforceReengagementGreeting,
  humanizePunctuationV3,
  detectVerboseLoop,
  VERBOSE_LOOP_FAREWELL
} from "./guards.server";

type OrchestratorInput = {
  userId: string;
  message: string;
  history: Array<{ sender: "agente" | "cliente"; body: string; created_at?: string }>;
  enabledModules: string[];
  customModules: Record<string, string>;
  anthropicApiKey?: string;
  extraContext?: string;
  isInbound?: boolean;
};

export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentResponseV3> {
  const { userId, message, history, enabledModules, customModules, anthropicApiKey, extraContext, isInbound = true } = input;

  const identity = await loadAgentIdentity(userId);
  const moduleKeys = selectRelevantModules(message, enabledModules);
  const modulePrompt = buildPromptFromModules(moduleKeys, customModules);

  // V3 ORCHESTRATOR - SYSTEM PROMPT CONSTRUCTION
  const systemPrompt = `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.

REGRAS DE OURO (NUNCA OMITIR):
- Responda de forma humana, natural e curta.
- ANTI-INVENÇÃO: NUNCA assume ou inventa qual rede ou serviço o cliente quer se ele não disse. Pergunte qual rede social ou serviço o cliente deseja.
- PROIBIDO ABSOLUTO: NUNCA menciona quantidade específica ou vaga de clientes (nem "mil clientes", nem "milhares", nem qualquer número). NUNCA inventa depoimento ou case nomeado. Se o cliente pedir prova social, diga que somos o maior painel do Brasil e oferecemos garantia de entrega.
- TERMINOLOGIA: YouTube → "views", NUNCA "plays". TikTok → "views", NUNCA "plays".
- MODO FECHAMENTO: Se o cliente disser "Ok" ou "blz" após você passar o preço, entenda como CONFIRMAÇÃO de interesse, nunca despedida.
- PROIBIDO ABSOLUTO omitir a saudação de volta quando o cliente te cumprimenta.
- Objeções como "não é golpe?" ou "tem risco?" com ponto de interrogação NUNCA são recusa real. Responda com confiança sem inventar números.
- MODO REENGAJAMENTO APÓS HIATO: Se o cliente voltar após muito tempo, apenas saúde de volta gentilmente sem cobrar resposta anterior. PROIBIDO emendar automaticamente perguntas pendentes.
- VETO DE PRIORIDADE MÁXIMA: Em situações de reengajamento, saúde de volta primeiro.
- FATO TÉCNICO VERIFICADO: Quando houver informações técnicas extras, use-as para fundamentar sua resposta com precisão.
- EXEMPLO_DISPARO: Se o cliente demonstrar interesse inicial, pergunte qual rede social ele deseja impulsionar.
- CATEGORIAS DE INTERESSE: 
  1. DIRETO: Quer comprar.
  2. NEUTRA (SÓ CORTESIA): Oi, tudo bem, etc. Responda com reciprocidade social.
  3. NEGATIVA: Recusa clara.
- MANTENHA O IDIOMA: Responda sempre no idioma em que o cliente está falando. (idioma da conversa)
- MODO REENGAJAMENTO / CORTESIA EM DISPARO: Se o cliente mandou apenas uma cortesia em uma conversa de disparo, apenas saúde de volta e REAPRESENTE A ISCA.



ESTADO DA CONVERSA:
${modulePrompt}

REGRAS DE IDENTIDADE:
${identity.persona}
${identity.regra_emoji}
${identity.regra_split}
${identity.terminologia_redes}
${identity.regra_anti_invencao}
${identity.exemplo_disparo}
${identity.reconhecimento_interesse}
${identity.regra_encerramento}
${identity.regra_estilo_escrita}

MODO SUPORTE / PÓS-VENDA:
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

CONTEXTO EXTRA (FATOS):
FATO TÉCNICO VERIFICADO: ${extraContext || "Nenhum contexto extra disponível."}


- Se o cliente enviar uma imagem, trate como comprovante ou evidência de erro. NUNCA resete o funil de vendas ao receber uma imagem.
- PROIBIDO voltar a pergunta de descoberta. PAGAMENTO/CHECKOUT/PIX/AJUDANDO A CONCLUIR.

OBRIGAÇÕES DE METADADOS:
Toda resposta deve começar com marcadores:
[TEMP:frio|morno|quente] [INTENT:...] [STAGE:...] 
Mensagem para o cliente aqui.

${extraContext ? `FATO TÉCNICO VERIFICADO:\n${extraContext}` : ""}
`;

  // Verbose Loop Check
  if (detectVerboseLoop(history)) {
    return {
      temperature: "frio",
      intent: "suporte",
      stage: "vendas",
      text: VERBOSE_LOOP_FAREWELL
    };
  }

  const payload = {
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: history.map(m => ({
      role: m.sender === "agente" ? "assistant" : "user",
      content: m.body
    })).concat([{ role: "user", content: message }])
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey || "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-beta": "prompt-caching-2024-07-31"
    },
    body: JSON.stringify(payload)
  });
  
  // VITEST_HACK: For some reason Vitest fails to parse the body above if it's sent directly.
  // We duplicate it into a closure-safe variable that the mock can see.
  // @ts-ignore
  globalThis.__last_agent_payload = payload;


  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic V3 API failed: ${err}`);
  }

  const data = await response.json();
  const llmTextRaw = data.content?.[0]?.text || "";
  const metadata = extractMetadataV3(llmTextRaw);
  
  let processedText = sanitizeSystemLeaks(metadata.text || "");
  processedText = limitEmojiFrequency(processedText, history);
  
  const greetingGuard = enforceReengagementGreeting(processedText, message);
  processedText = greetingGuard.text;
  
  processedText = humanizePunctuationV3(processedText);

  return {
    ...metadata,
    text: processedText
  };
}