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
};

export async function runAgentV3Turn(input: OrchestratorInput): Promise<AgentResponseV3> {
  const { userId, message, history, enabledModules, customModules, anthropicApiKey } = input;

  // 1. Load Identity
  const identity = await loadAgentIdentity(userId);

  // 2. Select Relevant Modules
  const moduleKeys = selectRelevantModules(message, enabledModules);
  const modulePrompt = buildPromptFromModules(moduleKeys, customModules);

  // 3. Build System Prompt
  const systemPrompt = `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.
REGRAS DE OURO:
- Responda de forma humana, natural e curta.
- Nunca use IA/bot como identificação.
- Use a terminologia correta de cada rede.

CONTEÚDO SELECIONADO PARA ESTE TURNO:
${modulePrompt}

REGRAS DE IDENTIDADE ADICIONAIS:
${identity.persona}
${identity.regra_emoji}
${identity.regra_split}

OBRIGAÇÕES DE METADADOS:
Toda resposta deve começar com marcadores no formato:
[TEMP:frio|morno|quente]
[INTENT:motivo_da_conversa]
[STAGE:estagio_do_funil]
Mensagem para o cliente aqui.
`;

  // 4. Call LLM (Haiku for V3 efficiency)
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

  // 6. Extract Metadata (from raw text which has the tags)
  const metadata = extractMetadataV3(llmTextRaw);
  
  // 5. Apply Deterministic Guards
  let processedText = sanitizeSystemLeaks(metadata.text || "");
  processedText = limitEmojiFrequency(processedText);
  processedText = enforceReengagementGreeting(processedText);
  processedText = humanizePunctuationV3(processedText);

  return {
    ...metadata,
    text: processedText
  };
}
