
import { runAgentV2Turn } from './src/lib/agent-v2.functions';

async function test() {
  console.log("--- TESTE AGENTE V2 ---");
  const testInput = {
    conversationId: "test-conv-123",
    workspaceId: "bd59fa41-d68d-4ac8-b995-e09ae48f52aa", // Mind ID
    phoneNumber: "5511999999999",
    currentMessage: "Olá",
    mode: 'receptive' as const,
    executionMode: 'real' as const,
  };

  try {
    const result = await runAgentV2Turn(testInput);
    console.log("SUCESSO!");
    console.log("Correlation ID:", result.metrics.correlationId);
    console.log("Módulos:", result.routeResult.selectedModules);
    console.log("Modelo:", result.modelRouteResult.selectedModel);
    console.log("Resposta IA:", result.finalResponse);
  } catch (err) {
    console.error("FALHA NO TURNO:");
    console.error(err);
  }
}

test();
