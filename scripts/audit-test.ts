
import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function runAuditTest() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  const message = "quero comprar plays";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
  
  console.log("Running V3 Audit Test for message:", message);
  
  const result = await runAgentV3Turn({
    userId,
    message,
    history: [],
    anthropicApiKey,
    inputKind: "texto",
    messageId: "audit-test-123"
  });

  console.log("Selected Keys:", result.selectedModules);
  console.log("Prompt Snapshot (Modules part):");
  const systemPrompt = result.rawPrompt[0].text;
  const modulesStart = systemPrompt.indexOf("ESTADO DA CONVERSA:");
  const modulesEnd = systemPrompt.indexOf("IDENTIDADE E PERSONA:");
  console.log(systemPrompt.substring(modulesStart, modulesEnd));
  
  console.log("Usage:", result.usage);
}

runAuditTest();
