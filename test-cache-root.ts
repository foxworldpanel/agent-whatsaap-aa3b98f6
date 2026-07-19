
import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function testCache() {
  const userId = "cache-test-user-" + Date.now();
  
  const history1 = [
    { role: "user", content: "Olá, como funcionam os seguidores?" }
  ];

  console.log("--- PRIMEIRA CHAMADA ---");
  const res1 = await runAgentV3Turn({
    userId,
    message: "Olá, como funcionam os seguidores?",
    history: history1,
    enabledModules: ["geral"],
    isInbound: true,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log("Usage 1:", JSON.stringify(res1.usage, null, 2));
  
  const history2 = [
    ...history1,
    { role: "agent", content: res1.replies.join(" ") },
    { role: "user", content: "E pro Instagram?" }
  ];

  console.log("\n--- SEGUNDA CHAMADA ---");
  const res2 = await runAgentV3Turn({
    userId,
    message: "E pro Instagram?",
    history: history2,
    enabledModules: ["geral"],
    isInbound: true,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log("Usage 2:", JSON.stringify(res2.usage, null, 2));
}

testCache().catch(console.error);
