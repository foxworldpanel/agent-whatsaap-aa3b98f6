/**
 * Agent Mind V2 - Analytics Aggregation Logic
 */
/**
 * Recalculates conversation analytics from a set of turns.
 * This is the idempotent way to ensure aggregates are always correct.
 */
export function aggregateConversationFromTurns(workspaceId, conversationId, turns) {
    if (turns.length === 0) {
        throw new Error('Cannot aggregate from zero turns');
    }
    // Sort turns by creation date to find start/end
    const sortedTurns = [...turns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const firstTurn = sortedTurns[0];
    const lastTurn = sortedTurns[sortedTurns.length - 1];
    // Mapping to snake_case as required by the database table
    const initialState = {
        workspace_id: workspaceId,
        conversation_id: conversationId,
        started_at: firstTurn.createdAt || new Date().toISOString(),
        ended_at: lastTurn.currentStep === 'conversation_closed' ? (lastTurn.createdAt || new Date().toISOString()) : null,
        created_at: firstTurn.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        mode: firstTurn.mode,
        primary_network: firstTurn.network || 'unknown',
        primary_service: firstTurn.service || 'unknown',
        total_turns: turns.length,
        customer_turns: turns.filter(t => t.mode === 'receptive').length,
        agent_turns: turns.filter(t => t.sentToCustomer || t.mode === 'outbound').length,
        llm_calls: turns.filter(t => t.usedLlm).length,
        deterministic_turns: turns.filter(t => t.deterministicResolution).length,
        tool_calls: turns.reduce((acc, t) => acc + (t.toolCallCount || 0), 0),
        tool_failures: turns.reduce((acc, t) => acc + (t.toolFailureCount || 0), 0),
        model_fallbacks: turns.filter(t => t.fallbackUsed).length,
        guard_violations: turns.reduce((acc, t) => acc + (t.guardViolations?.length || 0), 0),
        regenerations: turns.reduce((acc, t) => acc + (t.regenerationCount || 0), 0),
        blocked_responses: turns.filter(t => t.blocked).length,
        repeated_question_count: 0,
        wrong_platform_count: 0,
        wrong_service_count: 0,
        wrong_price_count: 0,
        support_redirect_count: turns.filter(t => t.intent === 'support').length,
        free_test_offered: turns.some(t => t.qualityFlags?.passedGuards && t.currentStep?.includes('free_test')),
        free_test_started: turns.some(t => t.currentStep === 'free_test_started'),
        free_test_completed: turns.some(t => t.currentStep === 'free_test_completed'),
        panel_guidance_started: turns.some(t => t.currentStep?.includes('panel')),
        reached_registration: turns.some(t => t.customerStage === 'registration'),
        reached_recharge: turns.some(t => t.customerStage === 'recharge'),
        reached_order_step: turns.some(t => t.customerStage === 'ordering'),
        panel_journey_completed: turns.some(t => t.currentStep === 'panel_journey_completed'),
        final_intent: lastTurn.intent,
        final_step: lastTurn.currentStep,
        total_input_tokens: turns.reduce((acc, t) => acc + (t.inputTokens || 0), 0),
        total_output_tokens: turns.reduce((acc, t) => acc + (t.outputTokens || 0), 0),
        total_cache_creation_tokens: turns.reduce((acc, t) => acc + (t.cacheCreationInputTokens || 0), 0),
        total_cache_read_tokens: turns.reduce((acc, t) => acc + (t.cacheReadInputTokens || 0), 0),
        total_estimated_cost: turns.reduce((acc, t) => acc + (t.estimatedCost || 0), 0),
        average_duration_ms: turns.reduce((acc, t) => acc + (t.durationMs || 0), 0) / turns.length,
        structural_quality_score: turns.reduce((acc, t) => acc + (t.structuralQualityScore || 0), 0) / turns.length,
        commercial_quality_score: turns.reduce((acc, t) => acc + (t.commercialQualityScore || 0), 0) / turns.length,
        safety_quality_score: turns.reduce((acc, t) => acc + (t.safetyQualityScore || 0), 0) / turns.length,
        overall_quality_score: turns.reduce((acc, t) => acc + (t.overallQualityScore || 0), 0) / turns.length,
        conversion_stage: lastTurn.customerStage,
        close_reason: lastTurn.currentStep === 'conversation_closed' ? 'normal_closure' : null
    };
    return initialState;
}
