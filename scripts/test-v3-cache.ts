
import { runAgentV3Turn } from "../src/lib/agent-v3/orchestrator.server";

async function testCache() {
  const userId = "cache-test-user-" + Date.now();
  
  // No history for the first call
  const history1 = [
    { role: "user", content: "Olá, como funcionam os seguidores?" }
  ];

  console.log("--- PRIMEIRA CHAMADA (Criação de Cache) ---");
  const res1 = await runAgentV3Turn({
    userId,
    message: "Olá, como funcionam os seguidores?",
    history: history1,
    enabledModules: ["geral"],
    isInbound: true,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log("Usage 1:", JSON.stringify(res1.usage, null, 2));
  console.log("Response 1:", res1.replies.join(" | "));
  
  // We expect rawPrompt or some usage info to be returned
  // In the real orchestrator, we might need to add usage to return type to see tokens
  
  const history2 = [
    ...history1,
    { role: "agent", content: res1.replies.join(" ") },
    { role: "user", content: "E pro Instagram especificamente?" }
  ];

  console.log("\n--- SEGUNDA CHAMADA (Deve ler do Cache) ---");
  const res2 = await runAgentV3Turn({
    userId,
    message: "E pro Instagram especificamente?",
    history: history2,
    enabledModules: ["geral"],
    isInbound: true,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log("Usage 2:", JSON.stringify(res2.usage, null, 2));
  console.log("Response 2:", res2.replies.join(" | "));
}

testCache().catch(console.error);
