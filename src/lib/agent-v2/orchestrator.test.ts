/**
 * Agent Mind V2 - E2E Tests
 */

import { runAgentV2Turn } from './orchestrator.ts';
import { ConversationStateV2 } from './conversation-state.types.ts';
import { AgentV2E2EInput } from './orchestrator.types.ts';

const INITIAL_STATE: ConversationStateV2 = {
  conversationId: 'test-e2e',
  workspaceId: 'ws-test',
  phoneNumber: '5511999999999',
  mode: 'receptive',
  network: 'unknown',
  service: 'unknown',
  intent: 'unknown',
  currentStep: 'greeting',
  customer: { hasAccount: false, hasBalance: false },
  payment: {},
  freeTest: { status: 'none' },
  tutorial: { active: false },
  support: { active: false },
  toolsUsed: [],
  loadedModules: [],
  facts: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

async function runE2ETests() {
  console.log("=== INICIANDO HOMOLOGAÇÃO END-TO-END V2 ===\n");

  // 1. SPOTIFY E COMPRA
  let state = { ...INITIAL_STATE };
  
  // Turno 1
  console.log("Turno 1: Cliente: 'Quero divulgar minha música.'");
  let result = await runAgentV2Turn(createInput(state, "Quero divulgar minha música."));
  printResult(result);
  state = result.stateAfter;

  // Turno 2
  console.log("\nTurno 2: Cliente: 'Spotify.'");
  result = await runAgentV2Turn(createInput(state, "Spotify."));
  printResult(result);
  state = result.stateAfter;

  // Turno 3
  console.log("\nTurno 3: Cliente: 'Playlist.'");
  result = await runAgentV2Turn(createInput(state, "Playlist."));
  printResult(result);
  state = result.stateAfter;

  // Turno 4
  console.log("\nTurno 4: Cliente: 'Quanto custa?'");
  result = await runAgentV2Turn(createInput(state, "Quanto custa?", { consultar_servicos: { salePrice: 49.90, isActive: true } }));
  printResult(result);
  state = result.stateAfter;

  // Turno 5
  console.log("\nTurno 5: Cliente: 'Vamos fechar.'");
  result = await runAgentV2Turn(createInput(state, "Vamos fechar."));
  printResult(result);
  state = result.stateAfter;

  // Turno 6
  console.log("\nTurno 6: Cliente: 'Não.' (cadastro)");
  result = await runAgentV2Turn(createInput(state, "Não."));
  printResult(result);
  state = result.stateAfter;

  console.log("\n=== CONVERSA 1 CONCLUÍDA ===\n");

  // 2. TESTE GRÁTIS SIMULADO
  state = { ...INITIAL_STATE };
  console.log("Turno 1: Cliente: 'Tenho medo de comprar e não funcionar.'");
  result = await runAgentV2Turn(createInput(state, "Tenho medo de comprar e não funcionar."));
  printResult(result);
  state = result.stateAfter;

  console.log("\nTurno 2: Cliente: 'Quero.'");
  result = await runAgentV2Turn(createInput(state, "Quero."));
  printResult(result);
  state = result.stateAfter;

  console.log("\nTurno 3: Cliente envia link.");
  result = await runAgentV2Turn(createInput(state, "https://open.spotify.com/track/123", { teste_gratis: { status: 'running' } }));
  printResult(result);
  state = result.stateAfter;

  console.log("\nTurno 4: Callback de teste concluído.");
  result = await runAgentV2Turn(createInput(state, "__test_callback__ teste concluído"));
  printResult(result);
  state = result.stateAfter;

  console.log("\n=== CONVERSA 2 CONCLUÍDA ===\n");
}

function createInput(state: ConversationStateV2, message: string, fixtures: any = {}): AgentV2E2EInput {
  return {
    workspaceId: state.workspaceId,
    conversationId: state.conversationId,
    phoneNumber: state.phoneNumber,
    currentMessage: message,
    previousState: state,
    mode: state.mode,
    shortHistory: [],
    toolFixtures: fixtures,
    executionMode: 'isolated'
  };
}

function printResult(result: any) {
  console.log(`- Resposta: "${result.finalResponse}"`);
  console.log(`- Intenção: ${result.routeResult.detectedIntent}`);
  console.log(`- Rede: ${result.stateAfter.network}`);
  console.log(`- Serviço: ${result.stateAfter.service}`);
  console.log(`- LLM: ${result.modelRouteResult.useLlm ? 'Sim' : 'Não'} (${result.modelRouteResult.selectedModel || 'N/A'})`);
  if (result.regenerationResult) console.log(`- REGENERAÇÃO EXECUTADA: ${result.regenerationResult.instruction}`);
  if (result.guardResult?.violations.length > 0) console.log(`- VIOLAÇÕES DE GUARDA: ${result.guardResult.violations.length}`);
}

// Para rodar via CLI se necessário
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  runE2ETests();
}

export { runE2ETests };
