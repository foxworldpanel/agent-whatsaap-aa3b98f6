/**
 * Agent Mind V2 - Analytics Aggregation Logic
 */

import { AgentV2TurnAnalytics, AgentV2ConversationAnalytics, CustomerStage } from './analytics.types';

/**
 * Recalculates conversation analytics from a set of turns.
 * This is the idempotent way to ensure aggregates are always correct.
 */
export function aggregateConversationFromTurns(
  workspaceId: string,
  conversationId: string,
  turns: AgentV2TurnAnalytics[]
): AgentV2ConversationAnalytics {
  if (turns.length === 0) {
    throw new Error('Cannot aggregate from zero turns');
  }

  // Sort turns by creation date to find start/end
  const sortedTurns = [...turns].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const firstTurn = sortedTurns[0];
  const lastTurn = sortedTurns[sortedTurns.length - 1];

  const initialState: AgentV2ConversationAnalytics = {
    workspaceId,
    conversationId,
    startedAt: firstTurn.createdAt,
    endedAt: lastTurn.currentStep === 'conversation_closed' ? lastTurn.createdAt : null,
    createdAt: firstTurn.createdAt,
    updatedAt: new Date().toISOString(),
    mode: firstTurn.mode,
    primaryNetwork: firstTurn.network || 'unknown',
    primaryService: firstTurn.service || 'unknown',
    totalTurns: turns.length,
    customerTurns: turns.filter(t => t.mode === 'receptive').length,
    agentTurns: turns.filter(t => t.mode === 'outbound').length,
    llmCalls: turns.filter(t => t.usedLlm).length,
    deterministicTurns: turns.filter(t => t.deterministicResolution).length,
    toolCalls: turns.reduce((acc, t) => acc + t.toolCallCount, 0),
    toolFailures: turns.reduce((acc, t) => acc + t.toolFailureCount, 0),
    modelFallbacks: turns.filter(t => t.fallbackUsed).length,
    guardViolations: turns.reduce((acc, t) => acc + (t.guardViolations?.length || 0), 0),
    regenerations: turns.reduce((acc, t) => acc + t.regenerationCount, 0),
    blockedResponses: turns.filter(t => t.blocked).length,
    repeatedQuestionCount: 0, // Logic would go here
    wrongPlatformCount: 0,
    wrongServiceCount: 0,
    wrongPriceCount: 0,
    supportRedirectCount: turns.filter(t => t.intent === 'support').length,
    freeTestOffered: turns.some(t => t.qualityFlags?.passedGuards && t.currentStep?.includes('free_test')),
    freeTestStarted: turns.some(t => t.currentStep === 'free_test_started'),
    freeTestCompleted: turns.some(t => t.currentStep === 'free_test_completed'),
    panelGuidanceStarted: turns.some(t => t.currentStep.includes('panel')),
    reachedRegistration: turns.some(t => t.customerStage === 'registration'),
    reachedRecharge: turns.some(t => t.customerStage === 'recharge'),
    reachedOrderStep: turns.some(t => t.customerStage === 'ordering'),
    panelJourneyCompleted: turns.some(t => t.currentStep === 'panel_journey_completed'),
    finalIntent: lastTurn.intent,
    finalStep: lastTurn.currentStep,
    totalInputTokens: turns.reduce((acc, t) => acc + t.inputTokens, 0),
    totalOutputTokens: turns.reduce((acc, t) => acc + t.outputTokens, 0),
    totalCacheCreationTokens: turns.reduce((acc, t) => acc + t.cacheCreationInputTokens, 0),
    totalCacheReadTokens: turns.reduce((acc, t) => acc + t.cacheReadInputTokens, 0),
    totalEstimatedCost: turns.reduce((acc, t) => acc + (t.estimatedCost || 0), 0),
    averageDurationMs: turns.reduce((acc, t) => acc + t.durationMs, 0) / turns.length,
    structuralQualityScore: turns.reduce((acc, t) => acc + (t.structuralQualityScore || 0), 0) / turns.length,
    commercialQualityScore: turns.reduce((acc, t) => acc + (t.commercialQualityScore || 0), 0) / turns.length,
    safetyQualityScore: turns.reduce((acc, t) => acc + (t.safetyQualityScore || 0), 0) / turns.length,
    overallQualityScore: turns.reduce((acc, t) => acc + (t.overallQualityScore || 0), 0) / turns.length,
    conversionStage: lastTurn.customerStage as CustomerStage,
    closeReason: lastTurn.currentStep === 'conversation_closed' ? 'normal_closure' : null
  };

  return initialState;
}
