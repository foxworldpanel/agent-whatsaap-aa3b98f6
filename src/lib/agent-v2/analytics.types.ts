/**
 * Agent Mind V2 - Analytics Engine Types
 */

export type CustomerStage =
  | 'new_lead'
  | 'greeting'
  | 'discovering_network'
  | 'discovering_service'
  | 'presenting_solution'
  | 'pricing'
  | 'objection'
  | 'free_test'
  | 'purchase_intent'
  | 'registration'
  | 'recharge'
  | 'ordering'
  | 'completed'
  | 'support'
  | 'lost'
  | 'closed';

export type V2EventName =
  | 'conversation_started'
  | 'turn_received'
  | 'state_updated'
  | 'module_routed'
  | 'model_routed'
  | 'deterministic_turn'
  | 'llm_called'
  | 'model_fallback'
  | 'tool_called'
  | 'tool_succeeded'
  | 'tool_failed'
  | 'prompt_built'
  | 'guard_triggered'
  | 'response_regenerated'
  | 'response_blocked'
  | 'response_approved'
  | 'panel_guidance_started'
  | 'free_test_offered'
  | 'free_test_started'
  | 'free_test_completed'
  | 'support_redirected'
  | 'conversation_closed';

export interface QualityFlags {
  answeredDirectly: boolean | 'not_applicable';
  contextPreserved: boolean | 'not_applicable';
  oneMainQuestion: boolean | 'not_applicable';
  noRepeatedQuestion: boolean | 'not_applicable';
  correctPlatform: boolean | 'not_applicable';
  correctService: boolean | 'not_applicable';
  correctPrice: boolean | 'not_applicable';
  toolGrounded: boolean | 'not_applicable';
  noForbiddenPromise: boolean | 'not_applicable';
  panelOnlyPayment: boolean | 'not_applicable';
  supportRedirectCorrect: boolean | 'not_applicable';
  closeFlowCorrect: boolean | 'not_applicable';
  naturalLength: boolean | 'not_applicable';
  passedGuards: boolean | 'not_applicable';
}

export interface AgentV2TurnAnalytics {
  eventId: string;
  workspaceId: string;
  conversationId: string;
  phoneHash: string;
  turnId: string;
  createdAt: string;
  brainVersion: string;
  builderVersion: string;
  executionMode: 'isolated_test' | 'shadow' | 'pilot' | 'production';
  sentToCustomer: boolean;
  mode: 'receptive' | 'outbound';
  network: string;
  service: string;
  intent: string;
  currentStep: string;
  customerStage: CustomerStage;
  usedLlm: boolean;
  deterministicResolution: boolean;
  selectedModel: string | null;
  routingReason: string | null;
  complexity: 'simple' | 'medium' | 'complex';
  selectedModules: string[];
  selectedTools: string[];
  selectedTutorials: string[];
  toolCallCount: number;
  toolSuccessCount: number;
  toolFailureCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  promptTokens: number;
  cacheablePrefixTokens: number;
  estimatedCost: number | null;
  currency: string;
  durationMs: number;
  guardViolations: string[];
  guardsTriggered: string[];
  regenerationCount: number;
  blocked: boolean;
  fallbackUsed: boolean;
  stateChangedFields: string[];
  responseChars: number;
  qualityFlags: QualityFlags;
  structuralQualityScore: number | null;
  commercialQualityScore: number | null;
  safetyQualityScore: number | null;
  overallQualityScore: number | null;
  errorCode: string | null;

  warning?: string;
  updatedAt?: string;
}

export interface AgentV2ConversationAnalytics {
  workspaceId: string;
  conversationId: string;
  startedAt: string;
  endedAt: string | null;
  mode: 'receptive' | 'outbound';
  primaryNetwork: string;
  primaryService: string;
  totalTurns: number;
  customerTurns: number;
  agentTurns: number;
  llmCalls: number;
  deterministicTurns: number;
  toolCalls: number;
  toolFailures: number;
  modelFallbacks: number;
  guardViolations: number;
  regenerations: number;
  blockedResponses: number;
  repeatedQuestionCount: number;
  wrongPlatformCount: number;
  wrongServiceCount: number;
  wrongPriceCount: number;
  supportRedirectCount: number;
  freeTestOffered: boolean;
  freeTestStarted: boolean;
  freeTestCompleted: boolean;
  panelGuidanceStarted: boolean;
  reachedRegistration: boolean;
  reachedRecharge: boolean;
  reachedOrderStep: boolean;
  panelJourneyCompleted: boolean;
  finalIntent: string;
  finalStep: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalEstimatedCost: number;
  averageDurationMs: number;
  structuralQualityScore: number;
  commercialQualityScore: number;
  safetyQualityScore: number;
  overallQualityScore: number;
  conversionStage: CustomerStage;
  closeReason: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelPricingConfigV2 {
  provider: string;
  model: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheCreationPricePerMillion: number;
  cacheReadPricePerMillion: number;
  currency: string;
  source: string;
  updatedAt: string;
}
