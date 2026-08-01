import { runAgentV3Turn } from './lib/agent-v3/orchestrator.server';
import 'dotenv/config';

async function runTest() {
  console.log("Testing Agent V3...");
  try {
    const result = await runAgentV3Turn({
      userId: "f8da521a-1d54-4696-9382-75d315b6d573",
      workspaceId: "bd59fa41-a5d6-4e56-b847-a8417c80084f",
      message: "Oi, como funciona?",
      history: [],
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      inputKind: "texto",
      businessDecision: {
        state: "descoberta",
        risk: "normal",
        reason: "teste regressão",
        nextAction: "explicar",
        allowQualification: true,
        shouldHandoff: false
      }
    });
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

runTest();
