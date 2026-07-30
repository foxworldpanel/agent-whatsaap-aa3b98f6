
import { runAgentV3Turn } from "./lib/agent-v3/orchestrator.server";
import dotenv from "dotenv";

dotenv.config();

async function runRealTest() {
  const input = {
    userId: "f8da521a-1d54-4696-9382-75d315b6d573", // Mind SMM ID
    workspaceId: "bd59fa41-a5d6-4e56-b847-a8417c80084f",
    message: "Bom dia",
    history: [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    inputKind: "texto" as const,
    businessDecision: {
      state: "novo_lead" as const,
      risk: "normal" as const,
      reason: "teste manual",
      nextAction: "saudação",
      allowQualification: true,
      shouldHandoff: false
    }
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
