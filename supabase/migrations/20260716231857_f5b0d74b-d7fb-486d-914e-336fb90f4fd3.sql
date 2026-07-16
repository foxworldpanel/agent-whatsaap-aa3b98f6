-- 1. Agent V2 Turn Analytics
CREATE TABLE IF NOT EXISTS public.agent_v2_turn_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    phone_hash TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    brain_version TEXT DEFAULT 'v2',
    builder_version TEXT,
    execution_mode TEXT,
    sent_to_customer BOOLEAN DEFAULT false,
    mode TEXT,
    network TEXT,
    service TEXT,
    intent TEXT,
    current_step TEXT,
    customer_stage TEXT,
    used_llm BOOLEAN,
    deterministic_resolution BOOLEAN,
    selected_model TEXT,
    routing_reason TEXT,
    complexity TEXT,
    selected_modules TEXT[],
    selected_tools TEXT[],
    selected_tutorials TEXT[],
    tool_call_count INTEGER DEFAULT 0,
    tool_success_count INTEGER DEFAULT 0,
    tool_failure_count INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_creation_input_tokens INTEGER DEFAULT 0,
    cache_read_input_tokens INTEGER DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    cacheable_prefix_tokens INTEGER DEFAULT 0,
    estimated_cost NUMERIC(10, 6) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    duration_ms INTEGER DEFAULT 0,
    guard_violations TEXT[],
    guards_triggered TEXT[],
    regeneration_count INTEGER DEFAULT 0,
    blocked BOOLEAN DEFAULT false,
    fallback_used BOOLEAN DEFAULT false,
    state_changed_fields TEXT[],
    response_chars INTEGER DEFAULT 0,
    quality_flags JSONB,
    structural_quality_score NUMERIC(5, 2),
    commercial_quality_score NUMERIC(5, 2),
    safety_quality_score NUMERIC(5, 2),
    overall_quality_score NUMERIC(5, 2),
    error_code TEXT,
    prompt_metric_id TEXT,
    UNIQUE(workspace_id, conversation_id, turn_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_v2_turn_analytics TO authenticated;
GRANT ALL ON public.agent_v2_turn_analytics TO service_role;
ALTER TABLE public.agent_v2_turn_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own workspace analytics turns" ON public.agent_v2_turn_analytics
    FOR ALL TO authenticated USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- 2. Agent V2 Conversation Analytics
CREATE TABLE IF NOT EXISTS public.agent_v2_conversation_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    phone_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    brain_version TEXT DEFAULT 'v2',
    turn_count INTEGER DEFAULT 0,
    llm_turn_count INTEGER DEFAULT 0,
    deterministic_turn_count INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_estimated_cost NUMERIC(10, 6) DEFAULT 0,
    avg_duration_ms INTEGER DEFAULT 0,
    max_duration_ms INTEGER DEFAULT 0,
    total_guard_violations INTEGER DEFAULT 0,
    total_regeneration_count INTEGER DEFAULT 0,
    was_blocked BOOLEAN DEFAULT false,
    was_fallback_used BOOLEAN DEFAULT false,
    final_intent TEXT,
    final_step TEXT,
    final_customer_stage TEXT,
    avg_overall_quality_score NUMERIC(5, 2),
    min_overall_quality_score NUMERIC(5, 2),
    max_overall_quality_score NUMERIC(5, 2),
    is_completed BOOLEAN DEFAULT false,
    sale_value NUMERIC(10, 2),
    UNIQUE(workspace_id, conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_v2_conversation_analytics TO authenticated;
GRANT ALL ON public.agent_v2_conversation_analytics TO service_role;
ALTER TABLE public.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own workspace conversation analytics" ON public.agent_v2_conversation_analytics
    FOR ALL TO authenticated USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- 3. Idempotent Upsert RPC
CREATE OR REPLACE FUNCTION public.upsert_agent_v2_turn_analytics(p_turn JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.agent_v2_turn_analytics (
        event_id, workspace_id, conversation_id, phone_hash, turn_id, 
        brain_version, builder_version, execution_mode, sent_to_customer,
        mode, network, service, intent, current_step, customer_stage,
        used_llm, deterministic_resolution, selected_model, routing_reason,
        complexity, selected_modules, selected_tools, selected_tutorials,
        tool_call_count, tool_success_count, tool_failure_count,
        input_tokens, output_tokens, cache_creation_input_tokens,
        cache_read_input_tokens, prompt_tokens, cacheable_prefix_tokens,
        estimated_cost, currency, duration_ms, guard_violations,
        guards_triggered, regeneration_count, blocked, fallback_used,
        state_changed_fields, response_chars, quality_flags,
        structural_quality_score, commercial_quality_score, safety_quality_score,
        overall_quality_score, error_code, prompt_metric_id, updated_at
    )
    VALUES (
        p_turn->>'eventId', (p_turn->>'workspaceId')::UUID, (p_turn->>'conversationId')::UUID, 
        p_turn->>'phoneHash', p_turn->>'turnId', p_turn->>'brainVersion', 
        p_turn->>'builderVersion', p_turn->>'executionMode', (p_turn->>'sentToCustomer')::BOOLEAN,
        p_turn->>'mode', p_turn->>'network', p_turn->>'service', p_turn->>'intent', 
        p_turn->>'currentStep', p_turn->>'customerStage', (p_turn->>'usedLlm')::BOOLEAN, 
        (p_turn->>'deterministicResolution')::BOOLEAN, p_turn->>'selectedModel', 
        p_turn->>'routingReason', p_turn->>'complexity', 
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'selected_modules')),
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'selected_tools')),
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'selected_tutorials')),
        (p_turn->>'toolCallCount')::INTEGER, (p_turn->>'toolSuccessCount')::INTEGER, 
        (p_turn->>'toolFailureCount')::INTEGER, (p_turn->>'inputTokens')::INTEGER, 
        (p_turn->>'outputTokens')::INTEGER, (p_turn->>'cacheCreationInputTokens')::INTEGER,
        (p_turn->>'cacheReadInputTokens')::INTEGER, (p_turn->>'promptTokens')::INTEGER, 
        (p_turn->>'cacheablePrefixTokens')::INTEGER, (p_turn->>'estimatedCost')::NUMERIC, 
        p_turn->>'currency', (p_turn->>'durationMs')::INTEGER, 
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'guard_violations')),
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'guards_triggered')),
        (p_turn->>'regenerationCount')::INTEGER, (p_turn->>'blocked')::BOOLEAN, 
        (p_turn->>'fallbackUsed')::BOOLEAN, 
        ARRAY(SELECT jsonb_array_elements_text(p_turn->'state_changed_fields')),
        (p_turn->>'responseChars')::INTEGER, p_turn->'qualityFlags',
        (p_turn->>'structuralQualityScore')::NUMERIC, (p_turn->>'commercialQualityScore')::NUMERIC, 
        (p_turn->>'safetyQualityScore')::NUMERIC, (p_turn->>'overallQualityScore')::NUMERIC, 
        p_turn->>'errorCode', p_turn->>'promptMetricId', now()
    )
    ON CONFLICT (workspace_id, conversation_id, turn_id) DO UPDATE SET
        sent_to_customer = EXCLUDED.sent_to_customer OR agent_v2_turn_analytics.sent_to_customer,
        regeneration_count = GREATEST(agent_v2_turn_analytics.regeneration_count, EXCLUDED.regeneration_count),
        blocked = agent_v2_turn_analytics.blocked OR EXCLUDED.blocked,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
