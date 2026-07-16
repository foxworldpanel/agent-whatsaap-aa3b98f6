/**
 * Agent Mind V2 - Model Router Tests
 */

import { routeModelV2 } from './model-router';
import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';
import { MODEL_CONFIG_V2 } from './model-router.types';

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
  metrics: {
    moduleCount: 4,
    toolCount: 0,
    tutorialCount: 0,
    routingDurationMs: 0,
    warningsCount: 0
  }
};

export async function runModelRouterTests() {
  console.log('🚀 Iniciando Testes do Model Router V2\n');

  const tests = [
    {
      name: 'A) "Boa tarde" (Lightweight)',
      input: {
        currentMessage: 'Boa tarde',
        conversationState: { ...mockState },
        routeResult: { ...mockRouteResult }
      },
      expected: {
        useLlm: true,
        selectedModel: MODEL_CONFIG_V2.lightweightModel,
        routingReason: 'greeting'
      }
    },
    {
      name: 'B) "Sim" (Deterministic)',
      input: {
        currentMessage: 'Sim',
        conversationState: { ...mockState, lastQuestion: 'Você já possui cadastro?' },
        routeResult: { ...mockRouteResult, detectedIntent: 'unknown' as any }
      },
      expected: {
        useLlm: false,
        selectedModel: null,
        routingReason: 'deterministic_state'
      }
    },
    {
      name: 'C) "500" (Deterministic)',
      input: {
        currentMessage: '500',
        conversationState: { ...mockState, lastQuestion: 'Qual a quantidade desejada?' },
        routeResult: { ...mockRouteResult, detectedIntent: 'unknown' as any }
      },
      expected: {
        useLlm: false,
        selectedModel: null,
        routingReason: 'deterministic_state'
      }
    },
    {
      name: 'D) "Spotify" (Lightweight)',
      input: {
        currentMessage: 'Spotify',
        conversationState: { ...mockState },
        routeResult: { ...mockRouteResult, detectedNetwork: 'spotify' as any, detectedIntent: 'network_detection' as any }
      },
      expected: {
        useLlm: true,
        selectedModel: MODEL_CONFIG_V2.lightweightModel
      }
    },
    {
      name: 'E) "Quanto custa?" (Price Lookup)',
      input: {
        currentMessage: 'Quanto custa?',
        conversationState: { ...mockState, network: 'spotify' as any, service: 'playlist' },
        routeResult: { ...mockRouteResult, detectedIntent: 'price', selectedTools: ['consultar_servicos'] }
      },
      expected: {
        useLlm: true,
        selectedModel: MODEL_CONFIG_V2.lightweightModel,
        routingReason: 'price_lookup'
      }
    },
    {
      name: 'H) Imagem Painel (Vision)',
      input: {
        currentMessage: 'Segue o print',
        conversationState: { ...mockState },
        routeResult: { ...mockRouteResult },
        hasImage: true
      },
      expected: {
        useLlm: true,
        selectedModel: MODEL_CONFIG_V2.visionModel,
        requiresVision: true,
        routingReason: 'vision_required'
      }
    },
    {
      name: 'J) Comparação Complexa (Strong)',
      input: {
        currentMessage: 'Qual é melhor, playlist ou seguidores para um lançamento de funk que eu vou fazer agora?',
        conversationState: { ...mockState, network: 'spotify' as any },
        routeResult: { ...mockRouteResult, detectedIntent: 'comparison' }
      },
      expected: {
        useLlm: true,
        selectedModel: MODEL_CONFIG_V2.strongModel,
        routingReason: 'objection_complex'
      }
    }
  ];

  let passed = 0;

  for (const t of tests) {
    const result = routeModelV2(t.input as any);
    
    const useLlmOk = result.useLlm === t.expected.useLlm;
    const modelOk = result.selectedModel === t.expected.selectedModel;
    const reasonOk = t.expected.routingReason ? result.routingReason === t.expected.routingReason : true;
    const visionOk = t.expected.requiresVision ? result.requiresVision === t.expected.requiresVision : true;

    if (useLlmOk && modelOk && reasonOk && visionOk) {
      console.log(`✅ PASSED: ${t.name}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${t.name}`);
      console.log('   Expected:', t.expected);
      console.log('   Actual:', { 
        useLlm: result.useLlm, 
        selectedModel: result.selectedModel, 
        routingReason: result.routingReason,
        requiresVision: result.requiresVision
      });
    }
  }

  console.log(`\n📊 Resultado Model Router: ${passed}/${tests.length} testes passaram.\n`);
}
