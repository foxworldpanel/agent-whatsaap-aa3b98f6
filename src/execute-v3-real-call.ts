
import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import dotenv from "dotenv";

dotenv.config();

async function runRealTest() {
  const input = {
    userId: "f8da521a-1d54-4696-9382-75d315b6d573", // Mind SMM ID
    message: "Bom dia",
    history: [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  };

  try {
    console.log("--- STARTING REAL V3 CALL ---");
    const result = await runAgentV3Turn(input);
    console.log("--- CALL FINISHED ---");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runRealTest();
