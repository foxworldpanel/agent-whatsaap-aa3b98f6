/**
 * Agent Mind V2 - E2E Tests (Full Homologation Suite)
 */

import { runAgentV2Turn } from './orchestrator.ts';
import { ConversationStateV2, V2Network } from './conversation-state.types.ts';
import { AgentV2E2EInput } from './orchestrator.types.ts';

export const INITIAL_STATE: ConversationStateV2 = {
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
  let state1 = { ...INITIAL_STATE, conversationId: 'conv-1' };
  console.log("--- CONVERSA 1: SPOTIFY E COMPRA ---");
  const conv1 = [
    { msg: "Quero divulgar minha música.", fix: {} },
    { msg: "Spotify.", fix: {} },
    { msg: "Playlist.", fix: {} },
    { msg: "Quanto custa?", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } } },
    { msg: "Vamos fechar.", fix: {} },
    { msg: "Não.", fix: {} } // ask_account -> no
  ];
  for (const [i, turn] of conv1.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state1, turn.msg, turn.fix));
    printResult(result);
    state1 = result.stateAfter;
  }

  // 2. TESTE GRÁTIS SIMULADO
  let state2 = { ...INITIAL_STATE, conversationId: 'conv-2' };
  console.log("\n--- CONVERSA 2: TESTE GRÁTIS ---");
  const conv2 = [
    { msg: "Tenho medo de comprar e não funcionar.", fix: {} },
    { msg: "Quero.", fix: {} },
    { msg: "https://open.spotify.com/track/123", fix: { teste_gratis: { status: 'running' } } },
    { msg: "__test_callback__ teste concluído", fix: {} }
  ];
  for (const [i, turn] of conv2.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state2, turn.msg, turn.fix));
    printResult(result);
    state2 = result.stateAfter;
  }

  // 3. SERVIÇO INATIVO
  let state3 = { ...INITIAL_STATE, conversationId: 'conv-3' };
  console.log("\n--- CONVERSA 3: SERVIÇO INATIVO ---");
  const conv3 = [
    { msg: "Quero plays no Spotify.", fix: { consultar_servicos: { salePrice: 49.90, isActive: false } } },
    { msg: "Sim.", fix: {} }
  ];
  for (const [i, turn] of conv3.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state3, turn.msg, turn.fix));
    printResult(result);
    state3 = result.stateAfter;
  }

  // 4. SUPORTE
  let state4: ConversationStateV2 = { ...INITIAL_STATE, conversationId: 'conv-4', network: 'spotify' as V2Network, service: 'playlist' };
  console.log("\n--- CONVERSA 4: SUPORTE ---");
  const conv4 = [
    { msg: "Meu pedido caiu.", fix: {} }
  ];
  for (const [i, turn] of conv4.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state4, turn.msg, turn.fix));
    printResult(result);
    state4 = result.stateAfter;
  }

  // 5. TROCA DE REDE
  let state5: ConversationStateV2 = { ...INITIAL_STATE, conversationId: 'conv-5', network: 'spotify' as V2Network, service: 'playlist' };
  console.log("\n--- CONVERSA 5: TROCA DE REDE ---");
  const conv5 = [
    { msg: "Na verdade quero YouTube.", fix: {} }
  ];
  for (const [i, turn] of conv5.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state5, turn.msg, turn.fix));
    printResult(result);
    state5 = result.stateAfter;
  }

  // 6. PREÇO ANTIGO NO HISTÓRICO
  let state6 = { ...INITIAL_STATE, conversationId: 'conv-6' };
  console.log("\n--- CONVERSA 6: PREÇO ANTIGO ---");
  const history6 = [{ sender: 'agente' as const, body: "Playlist custa R$ 97." }];
  const conv6 = [
    { msg: "Quanto custa?", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } } }
  ];
  for (const [i, turn] of conv6.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const input = createInput(state6, turn.msg, turn.fix);
    input.shortHistory = history6;
    const result = await runAgentV2Turn(input);
    printResult(result);
    state6 = result.stateAfter;
  }

  // 7. REGENERAÇÃO FORÇADA
  let state7 = { ...INITIAL_STATE, conversationId: 'conv-7' };
  console.log("\n--- CONVERSA 7: REGENERAÇÃO FORÇADA ---");
  const conv7 = [
    { msg: "Quanto custa? (force_error)", fix: { consultar_servicos: { salePrice: 49.90, isActive: true } } }
  ];
  for (const [i, turn] of conv7.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state7, turn.msg, turn.fix));
    printResult(result);
    state7 = result.stateAfter;
  }

  // 8. ENCERRAMENTO
  let state8 = { ...INITIAL_STATE, conversationId: 'conv-8' };
  console.log("\n--- CONVERSA 8: ENCERRAMENTO ---");
  const conv8 = [
    { msg: "Obrigado.", fix: {} }
  ];
  for (const [i, turn] of conv8.entries()) {
    console.log(`Turno ${i+1}: Cliente: '${turn.msg}'`);
    const result = await runAgentV2Turn(createInput(state8, turn.msg, turn.fix));
    printResult(result);
    state8 = result.stateAfter;
  }

  console.log("\n=== HOMOLOGAÇÃO E2E CONCLUÍDA ===\n");
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
  console.log(`DETALHES DO TURNO:`);
  console.log(`- Cliente: "${result.stateBefore.lastAnswer || ''}" -> "${result.finalResponse}"`);
  console.log(`- stateBefore: network=${result.stateBefore.network}, service=${result.stateBefore.service}, intent=${result.stateBefore.intent}, step=${result.stateBefore.currentStep}`);
  console.log(`- shortAnswerResolution: ${result.shortAnswerResolution ? (result.shortAnswerResolution.resolved ? 'RESOLVIDO' : 'NÃO RESOLVIDO') : 'N/A'}`);
  console.log(`- routeResult: modules=${result.routeResult.selectedModules.join(',')}, tools=${result.routeResult.selectedTools.join(',')}`);
  console.log(`- stateEvents: ${result.routeResult.stateEvents.map((e: any) => e.type).join(',')}`);
  console.log(`- modelRouteResult: useLlm=${result.modelRouteResult.useLlm}, model=${result.modelRouteResult.selectedModel || 'N/A'}, reason=${result.modelRouteResult.routingReason}`);
  console.log(`- guardResult: violations=${result.guardResult?.violations.length || 0}, blocked=${result.guardResult?.blocked || false}`);
  if (result.regenerationResult) {
    console.log(`- REGENERAÇÃO: ${result.regenerationResult.instruction}`);
    console.log(`- REGEN_GUARD: violations=${result.regenerationResult.guardResult.violations.length}`);
  }
  console.log(`- finalResponse: "${result.finalResponse}"`);
  console.log(`- stateAfter: network=${result.stateAfter.network}, service=${result.stateAfter.service}, intent=${result.stateAfter.intent}, step=${result.stateAfter.currentStep}`);
  console.log(`- metrics: duration=${result.metrics.durationMs}ms, usedLlm=${result.metrics.usedLlm}`);
  console.log("-----------------------------------");
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  runE2ETests();
}

export { runE2ETests };
