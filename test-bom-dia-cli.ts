import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";

async function test() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  const message = "Bom dia";
  const history = [];
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";

  console.log("Starting test for 'Bom dia'...");
  try {
    const result = await runAgentV3Turn({
      userId,
      message,
      history,
      anthropicApiKey
    });
    console.log("\n--- TEST RESULT ---");
    // console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
