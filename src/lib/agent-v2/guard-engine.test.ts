/**
 * Agent Mind V2 - Guard Engine Tests
 */

import { runGuardEngineV2 } from './guard-engine';
import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';
import { RouteModelV2Output } from './model-router';

const mockState: ConversationStateV2 = {
  conversationId: 'test',
  workspaceId: 'test',
  phoneNumber: '5511999999999',
  mode: 'receptive',
  network: 'unknown',
  service: 'unknown',
  intent: 'greeting',
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
  updatedAt: new Date().toISOString(),
};

const mockRouteResult: RouteModulesV2Output = {
  selectedModules: ['mission', 'identity', 'guards', 'receptive'],
  selectedTools: [],
  selectedTutorials: [],
  detectedMode: 'receptive',
  detectedNetwork: 'unknown',
  detectedService: 'unknown',
  detectedIntent: 'greeting',
  routingReason: 'test',
  stateEvents: [],
  warnings: [],
  metrics: { moduleCount: 4, toolCount: 0, tutorialCount: 0, routingDurationMs: 0, warningsCount: 0 }
};

const mockModelResult: RouteModelV2Output = {
  useLlm: true,
  selectedModel: 'haiku',
  requiresVision: false,
  requiresTranscription: false,
  routingReason: 'greeting',
  confidence: 1.0,
  warnings: [],
  metrics: { decisionDurationMs: 0, complexity: 'simple', estimatedCostClass: 'low' }
};

export async function runGuardEngineTests() {
  console.log('🚀 Iniciando Testes do Guard Engine V2\n');

  const tests = [
    {
      name: 'A) Preço correto',
      input: {
        draftResponse: 'Custa R$ 49,90.',
        toolResults: { consultar_servicos: { salePrice: 49.90 } }
      },
      expected: { approved: true }
    },
    {
      name: 'B) Preço antigo',
      input: {
        draftResponse: 'Custa R$ 97.',
        toolResults: { consultar_servicos: { salePrice: 49.90 } }
      },
      expected: { approved: false, requiresRegeneration: true }
    },
    {
      name: 'D) Plataforma errada',
      input: {
        draftResponse: 'No Instagram temos seguidores.',
        conversationState: { ...mockState, network: 'spotify' as any }
      },
      expected: { approved: false, requiresRegeneration: true }
    },
    {
      name: 'F) Suporte inadequado (Replace Minimal)',
      input: {
        currentMessage: 'Meu pedido caiu',
        draftResponse: 'Me manda o ID que vou verificar.',
        routeResult: { ...mockRouteResult, detectedIntent: 'support' as any }
      },
      expected: { approved: false, finalResponse: 'Para analisar esse caso, abra um ticket no suporte do painel. Por lá a equipe consegue acessar os dados do pedido.' }
    },
    {
      name: 'G) Promessa proibida',
      input: {
        draftResponse: 'Isso vai ativar o algoritmo e viralizar.'
      },
      expected: { approved: false, requiresRegeneration: true }
    },
    {
      name: 'J) Pagamento proibido (Block)',
      input: {
        draftResponse: 'Me faça um PIX nesta chave.'
      },
      expected: { blocked: true }
    },
    {
      name: 'O) Excesso de emojis (Sanitize)',
      input: {
        draftResponse: 'Olá! 🚀🔥✨💎'
      },
      expected: { approved: false, action: 'sanitize' }
    }
  ];

  let passed = 0;

  for (const t of tests) {
    const res = runGuardEngineV2({
      draftResponse: t.input.draftResponse,
      currentMessage: t.input.currentMessage || 'oi',
      conversationState: t.input.conversationState || mockState,
      routeResult: t.input.routeResult || mockRouteResult,
      modelRouteResult: mockModelResult,
      selectedModules: [],
      selectedTools: [],
      toolResults: t.input.toolResults || {},
      executionMode: 'test'
    });

    const approvedOk = t.expected.approved !== undefined ? res.approved === t.expected.approved : true;
    const blockedOk = t.expected.blocked !== undefined ? res.blocked === t.expected.blocked : true;
    const regenOk = t.expected.requiresRegeneration !== undefined ? res.requiresRegeneration === t.expected.requiresRegeneration : true;
    const responseOk = t.expected.finalResponse ? res.finalResponse === t.expected.finalResponse : true;

    if (approvedOk && blockedOk && regenOk && responseOk) {
      console.log(`✅ PASSED: ${t.name}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${t.name}`);
      console.log('   Actual:', { approved: res.approved, blocked: res.blocked, regen: res.requiresRegeneration, response: res.finalResponse });
    }
  }

  console.log(`\n📊 Resultado Guard Engine: ${passed}/${tests.length} testes passaram.\n`);
}
