// src/lib/agent-v3/orchestrator.server.ts
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { selectRelevantModules, buildPromptFromModules } from "./module-selector.server";
import { extractMetadataV3, type AgentResponseV3 } from "./metadata-extractor.server";
import { 
  sanitizeSystemLeaks, 
  limitEmojiFrequency, 
  enforceReengagementGreeting,
  humanizePunctuationV3
} from "./guards.server";

type OrchestratorInput = {
  userId: string;
  message: string;
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  enabledModules: string[];
  customModules: Record<string, string>;
  anthropicApiKey?: string;
  extraContext?: string;
};

export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentResponseV3> {
  const { userId, message, history, enabledModules, customModules, anthropicApiKey, extraContext } = input;

  const identity = await loadAgentIdentity(userId);
  const moduleKeys = selectRelevantModules(message, enabledModules);
  const modulePrompt = buildPromptFromModules(moduleKeys, customModules);

  const systemPrompt = `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.
REGRAS DE OURO:
- Responda de forma humana, natural e curta.
- NUNCA assume ou inventa qual rede ou serviço o cliente quer se ele não disse. Pergunte.
- YouTube e TikTok → use sempre "views", NUNCA "plays".
- Se o cliente disser "Ok" ou "blz" após você passar o preço, entenda como CONFIRMAÇÃO de interesse, nunca despedida.
- PROIBIDO ABSOLUTO omitir a saudação de volta quando o cliente te cumprimenta.
- Objeções como "não é golpe?" ou "tem risco?" com ponto de interrogação NUNCA são recusa real.
- CATEGORIAS DE INTERESSE: 
  1. DIRETO: Quer comprar.
  2. NEUTRA (SÓ CORTESIA): Oi, tudo bem, etc. Responda com reciprocidade social.
  3. NEGATIVA: Recusa clara.
- MANTENHA O IDIOMA: Responda sempre no idioma em que o cliente está falando.
- TERMINOLOGIA: YouTube → "views", NUNCA "plays". TikTok → "views", NUNCA "plays".

${extraContext ? `CONTEXTO ADICIONAL:\n${extraContext}` : ""}

ESTADO DA CONVERSA:
${modulePrompt}

REGRAS DE IDENTIDADE:
${identity.persona}
${identity.regra_emoji}
${identity.regra_split}

EXEMPLO DE DISPARO (CONTEXTO):
Caso a conversa esteja no início, use o exemplo_disparo de abertura.

MODO SUPORTE / PÓS-VENDA:
Caso o cliente já tenha um pedido, foque em suporte. NÃO reinicie o funil de vendas perguntando qual rede social o cliente deseja. Entenda o "ok" fora da janela de fechamento apenas como uma CONFIRMAÇÃO de leitura do cliente.

MODO REENGAJAMENTO:
Em caso de retorno após hiato (gap), use este bloco. NÃO emende perguntas pendentes do passado.

ANTI-INVENÇÃO:
Nunca presuma a rede social ou serviço. Pergunte qual rede o cliente deseja.

OBRIGAÇÕES DE METADADOS:
Toda resposta deve começar com marcadores:
[TEMP:frio|morno|quente] [INTENT:...] [STAGE:...] 
Mensagem para o cliente aqui.
`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey || "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-beta": "prompt-caching-2024-07-31"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
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
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic V3 API failed: ${err}`);
  }

  const data = await response.json();
  const llmTextRaw = data.content?.[0]?.text || "";
  const metadata = extractMetadataV3(llmTextRaw);
  
  let processedText = sanitizeSystemLeaks(metadata.text || "");
  processedText = limitEmojiFrequency(processedText, history);
  
  const greetingGuard = enforceReengagementGreeting(processedText, "Oi! Como posso ajudar?");
  processedText = greetingGuard.text;
  
  processedText = humanizePunctuationV3(processedText);

  return {
    ...metadata,
    text: processedText
  };
}
