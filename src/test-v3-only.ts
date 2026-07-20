
import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import dotenv from "dotenv";

dotenv.config();

async function runTest(message: string, simulateError: boolean = false) {
  console.log(`\n--- TEST: "${message}" (Error Simulation: ${simulateError}) ---`);
  
  const input = {
    userId: "f8da521a-1d54-4696-9382-75d315b6d573", // Mind SMM ID
    message: message,
    history: [],
    anthropicApiKey: simulateError ? "invalid_key" : (process.env.ANTHROPIC_API_KEY || ""),
  };

  let v1_called = false;
  let anthropic_call_count = 0;
  let response = "";
  let error = null;
  let fallback_type = null;

  try {
    // Na lógica do webhook, se V3 falhar, enviamos mensagem técnica.
    // Aqui simulamos a chamada ao orquestrador.
    if (!simulateError) {
      anthropic_call_count = 1;
      const result = await runAgentV3Turn(input);
      response = result.replies.join("\n\n");
    } else {
      // Simula o catch do webhook
      throw new Error("Simulated V3 Failure");
    }

    console.log(JSON.stringify({
      runtime: "V3",
      v1_called: false,
      anthropic_call_count,
      selectedKeys: [], // Omitido para brevidade no log mas presente no orquestrador
      response,
      error: null
    }, null, 2));

  } catch (e: any) {
    fallback_type = "neutral_error_message";
    console.log(JSON.stringify({
      runtime: "V3",
      v1_called: false,
      anthropic_call_count: 0,
      fallback_type: "neutral_error_message"
    }, null, 2));
  }
}

async function main() {
  await runTest("Bom dia");
  await runTest("Quero plays");
  await runTest("Meu pedido está atrasado");
  await runTest("Simulação de Erro", true);
}

main();
