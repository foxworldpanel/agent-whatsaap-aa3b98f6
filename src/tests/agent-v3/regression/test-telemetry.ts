import { runAgentV3Turn } from "../../../lib/agent-v3/orchestrator.server";
import "dotenv/config";

const TEST_USER_ID = "f8da521a-1d54-4696-9382-75d315b6d573";
const TEST_WORKSPACE_ID = "bd59fa41-a5d6-4e56-b847-a8417c80084f";

async function test() {
  console.log("Testing Telemetry...");
  try {
    const result = await runAgentV3Turn({
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      message: "Quero 1000 plays no Spotify",
      history: [],
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      inputKind: "texto",
      messageId: "test-telemetry-1",
      businessDecision: {
        state: "orcamento",
        risk: "normal",
        reason: "teste telemetria",
        nextAction: "preço",
        allowQualification: false,
        shouldHandoff: false
      }
    });
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
