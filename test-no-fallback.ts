import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import { DEFAULT_MODULES_V3 } from "./src/lib/agent-v3/default-modules-v3.server";

// We force the DEFAULT_MODULES_V3 to be empty strings in this test execution
// to see if the database content is enough.
// Actually, I can just check if any fallback is used in the prompt.

const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";

async function test() {
  const result = await runAgentV3Turn({
    userId,
    message: "Quero comprar plays no Spotify",
    history: [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    inputKind: "texto"
  });

  const prompt = JSON.stringify(result.rawPrompt);
  const fallbacksUsed = prompt.includes("origin: fallback");
  const fallbackTechnicalUsed = prompt.includes("Fallback técnico");

  console.log("Módulos com fallback no prompt:", fallbacksUsed);
  console.log("Mensagem de fallback técnico encontrada:", fallbackTechnicalUsed);

  if (!fallbacksUsed && !fallbackTechnicalUsed) {
    console.log("RESULTADO: SUCESSO. Todo o conhecimento veio do DATABASE.");
  } else {
    console.log("RESULTADO: FALHA. Ainda existem fallbacks sendo usados.");
    // Identify which ones
    result.modules.selected_keys.forEach(k => {
        if (prompt.includes(`[MODULE: ${k} | origin: fallback`)) {
            console.log(`- Fallback detectado para: ${k}`);
        }
    });
  }
}

test();
