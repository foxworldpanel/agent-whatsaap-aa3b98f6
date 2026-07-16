/**
 * Agent Mind V2 - Analytics Engine Tests
 */

import { runAgentV2Turn } from './orchestrator.ts';
import { INITIAL_STATE, createInput, printResult } from './orchestrator.test.ts';
import { calculateQualityScores } from './analytics';

async function runAnalyticsTests() {
  console.log("=== INICIANDO TESTES DO ANALYTICS ENGINE V2 ===\n");

  // A) Turno Determinístico
  console.log("--- TESTE A: TURNO DETERMINÍSTICO ---");
  const resA = await runAgentV2Turn(createInput(INITIAL_STATE, "Obrigado.", {}));
  console.log(`- usedLlm: ${resA.metrics.analytics.usedLlm}`);
  console.log(`- estimatedCost: ${resA.metrics.analytics.estimatedCost}`);
  console.log(`- intent: ${resA.metrics.analytics.intent}`);
  console.log(`- customerStage: ${resA.metrics.analytics.customerStage}`);
  console.log("-----------------------------------\n");

  // B) Turno com Haiku
  console.log("--- TESTE B: TURNO COM HAIKU ---");
  const resB = await runAgentV2Turn(createInput(INITIAL_STATE, "Quero divulgar minha música.", {}));
  console.log(`- selectedModel: ${resB.metrics.analytics.selectedModel}`);
  console.log(`- estimatedCost: ${resB.metrics.analytics.estimatedCost}`);
  console.log(`- routingReason: ${resB.metrics.analytics.routingReason}`);
  console.log("-----------------------------------\n");

  // C) Teste de Qualidade
  console.log("--- TESTE C: CÁLCULO DE QUALIDADE ---");
  const flags = {
    answeredDirectly: true,
    contextPreserved: true,
    oneMainQuestion: true,
    noRepeatedQuestion: true,
    correctPlatform: true,
    correctService: true,
    correctPrice: true,
    toolGrounded: true,
    noForbiddenPromise: true,
    panelOnlyPayment: true,
    supportRedirectCorrect: true,
    closeFlowCorrect: true,
    naturalLength: true,
    passedGuards: true
  };
  const scores = calculateQualityScores(flags as any);
  console.log(`- Overall Quality Score: ${scores.overall}%`);
  console.log(`- Structural: ${scores.structural}%`);
  console.log(`- Commercial: ${scores.commercial}%`);
  console.log(`- Safety: ${scores.safety}%`);
  console.log("-----------------------------------\n");

  // D) Conversa Completa e Estágios
  console.log("--- TESTE D: CONVERSA E ESTÁGIOS ---");
  let state = { ...INITIAL_STATE, conversationId: 'analytics-funnel' };
  const scenario = [
    { msg: "Quanto custa seguidores no Instagram?", intent: 'pricing' },
    { msg: "Quero comprar.", intent: 'buy' },
    { msg: "Vou fazer o cadastro.", intent: 'buy' }
  ];
  
  for (const turn of scenario) {
    const res = await runAgentV2Turn(createInput(state, turn.msg));
    console.log(`Msg: "${turn.msg}" -> Stage: ${res.metrics.analytics.customerStage}`);
    state = res.stateAfter;
  }
  console.log("-----------------------------------\n");

  console.log("=== TESTES DO ANALYTICS ENGINE CONCLUÍDOS ===\n");
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  runAnalyticsTests();
}

export { runAnalyticsTests };
