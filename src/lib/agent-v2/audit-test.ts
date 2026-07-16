import { buildPromptV2 } from './prompt-builder';
import { ConversationStateV2 } from './conversation-state.types';
import { RouteModulesV2Output } from './router.types';

const mockState: ConversationStateV2 = {
  conversationId: 'test',
  workspaceId: 'test',
  phoneNumber: 'test',
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
  updatedAt: new Date().toISOString()
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

const scenarios = [
  { name: "Boa tarde", message: "Boa tarde" },
];

scenarios.forEach(s => {
  const result = buildPromptV2({
    currentMessage: s.message,
    history: [],
    conversationState: mockState,
    routeResult: mockRouteResult,
    brainVersion: 'v2',
    builderVersion: '2.0.0'
  });
  
  console.log("=== Cenario: " + s.name + " ===");
  console.log("Tokens: " + result.estimatedTokens);
  console.log("---");
});
