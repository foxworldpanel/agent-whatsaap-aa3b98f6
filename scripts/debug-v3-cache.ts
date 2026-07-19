
import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function testCache() {
  const userId = "cache-test-user-" + Date.now();
  
  console.log("--- PRIMEIRA CHAMADA (Criação de Cache) ---");
  const res1 = await runAgentV3Turn({
    userId,
    userName: "Teste",
    message: "Olá, como funcionam os seguidores?",
    isAudio: false
  });
  console.log("Response 1:", res1.text.substring(0, 50) + "...");
  console.log("Usage 1:", JSON.stringify(res1.usage, null, 2));

  console.log("\n--- SEGUNDA CHAMADA (Deve ler do Cache) ---");
  const res2 = await runAgentV3Turn({
    userId,
    userName: "Teste",
    message: "E pro Instagram especificamente?",
    isAudio: false
  });
  console.log("Response 2:", res2.text.substring(0, 50) + "...");
  console.log("Usage 2:", JSON.stringify(res2.usage, null, 2));
}

testCache().catch(console.error);
