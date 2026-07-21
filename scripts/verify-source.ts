import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function verifySource() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  const message = "quero comprar plays";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
  
  const result = await runAgentV3Turn({
    userId,
    message,
    history: [],
    anthropicApiKey,
    inputKind: "texto",
    messageId: "source-audit-" + Date.now()
  });

  console.log("Selected Keys:", result.selectedModules);
  
  // Checking for standard keys expected
  const expectedKeys = ["identidade", "regras_gerais", "comportamento_humano", "fluxo_vendas", "spotify"];
  console.log("Audit Result:");
  expectedKeys.forEach(key => {
    const present = result.selectedModules.includes(key);
    console.log(`- ${key}: ${present ? 'PRESENT' : 'MISSING'}`);
  });
}

verifySource();
