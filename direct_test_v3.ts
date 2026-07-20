import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import { secrets } from "virtual:lovable-secrets";

async function test() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7"; // Mind SMM Real User ID
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not found in environment.");
    return;
  }

  console.log("--- TEST TURN 1: Greeting ---");
  const r1 = await runAgentV3Turn({
    userId,
    message: "Boa noite",
    history: [],
    enabledModules: [],
    anthropicApiKey: apiKey
  });
  console.log("Júlia:", r1.replies[0]);

  console.log("\n--- TEST TURN 2: Product Context ---");
  const r2 = await runAgentV3Turn({
    userId,
    message: "quero comprar plays",
    history: [
      { role: "customer", content: "Boa noite" },
      { role: "agent", content: r1.replies[0] }
    ],
    enabledModules: [],
    anthropicApiKey: apiKey
  });
  console.log("Júlia:", r2.replies[0]);
}

test().catch(console.error);
