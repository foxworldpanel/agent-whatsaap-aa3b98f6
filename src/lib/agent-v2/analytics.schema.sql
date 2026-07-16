-- Analytics Engine V2 - Database Schema

-- 1. Model Pricing Configuration
CREATE TABLE public.agent_v2_model_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    model text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    input_price_per_million numeric NOT NULL,
    output_price_per_million numeric NOT NULL,
    cache_creation_price_per_million numeric NOT NULL,
    cache_read_price_per_million numeric NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    source text NOT NULL DEFAULT 'official',
    updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_v2_model_pricing TO authenticated;
GRANT ALL ON public.agent_v2_model_pricing TO service_role;
ALTER TABLE public.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pricing"
ON public.agent_v2_model_pricing
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read pricing"
ON public.agent_v2_model_pricing
FOR SELECT
TO authenticated
USING (true);

-- 2. Turn Analytics
CREATE TABLE public.agent_v2_turn_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text NOT NULL,
    phone_hash text NOT NULL,
    turn_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    brain_version text NOT NULL,
    builder_version text NOT NULL,
    execution_mode text NOT NULL, -- isolated_test, shadow, pilot, production
    sent_to_customer boolean NOT NULL DEFAULT false,
    mode text NOT NULL,
    network text,
    service text,
    intent text,
    current_step text,
    customer_stage text NOT NULL,
    used_llm boolean NOT NULL,
    deterministic_resolution boolean NOT NULL DEFAULT false,
    selected_model text,
    routing_reason text,
    complexity text,
    selected_modules text[],
    selected_tools text[],
    selected_tutorials text[],
    tool_call_count integer DEFAULT 0,
    tool_success_count integer DEFAULT 0,
    tool_failure_count integer DEFAULT 0,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    cache_creation_input_tokens integer DEFAULT 0,
    cache_read_input_tokens integer DEFAULT 0,
    prompt_tokens integer DEFAULT 0,
    cacheable_prefix_tokens integer DEFAULT 0,
    estimated_cost numeric,
    duration_ms integer NOT NULL,
    guard_violations text[],
    guards_triggered text[],
    regeneration_count integer DEFAULT 0,
    blocked boolean DEFAULT false,
    fallback_used boolean DEFAULT false,
    state_changed_fields text[],
    response_chars integer DEFAULT 0,
    quality_flags jsonb,
    error_code text,
    warning text
);

GRANT SELECT, INSERT ON public.agent_v2_turn_analytics TO authenticated;
GRANT ALL ON public.agent_v2_turn_analytics TO service_role;
ALTER TABLE public.agent_v2_turn_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their workspace analytics"
ON public.agent_v2_turn_analytics
FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE INDEX idx_turn_analytics_workspace ON public.agent_v2_turn_analytics(workspace_id);
CREATE INDEX idx_turn_analytics_conversation ON public.agent_v2_turn_analytics(conversation_id);
CREATE INDEX idx_turn_analytics_created ON public.agent_v2_turn_analytics(created_at);

-- 3. Conversation Analytics (Aggregated)
CREATE TABLE public.agent_v2_conversation_analytics (
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text PRIMARY KEY,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    mode text NOT NULL,
    primary_network text,
    primary_service text,
    total_turns integer DEFAULT 0,
    customer_turns integer DEFAULT 0,
    agent_turns integer DEFAULT 0,
    llm_calls integer DEFAULT 0,
    deterministic_turns integer DEFAULT 0,
    tool_calls integer DEFAULT 0,
    tool_failures integer DEFAULT 0,
    model_fallbacks integer DEFAULT 0,
    guard_violations integer DEFAULT 0,
    regenerations integer DEFAULT 0,
    blocked_responses integer DEFAULT 0,
    repeated_question_count integer DEFAULT 0,
    wrong_platform_count integer DEFAULT 0,
    wrong_service_count integer DEFAULT 0,
    wrong_price_count integer DEFAULT 0,
    support_redirect_count integer DEFAULT 0,
    free_test_offered boolean DEFAULT false,
    free_test_started boolean DEFAULT false,
    free_test_completed boolean DEFAULT false,
    panel_guidance_started boolean DEFAULT false,
    reached_registration boolean DEFAULT false,
    reached_recharge boolean DEFAULT false,
    reached_order_step boolean DEFAULT false,
    panel_journey_completed boolean DEFAULT false,
    final_intent text,
    final_step text,
    total_input_tokens integer DEFAULT 0,
    total_output_tokens integer DEFAULT 0,
    total_cache_creation_tokens integer DEFAULT 0,
    total_cache_read_tokens integer DEFAULT 0,
    total_estimated_cost numeric DEFAULT 0,
    average_duration_ms numeric DEFAULT 0,
    quality_score numeric DEFAULT 0,
    overall_quality_score numeric DEFAULT 0,
    conversion_stage text,
    close_reason text
);

GRANT SELECT, INSERT, UPDATE ON public.agent_v2_conversation_analytics TO authenticated;
GRANT ALL ON public.agent_v2_conversation_analytics TO service_role;
ALTER TABLE public.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their workspace conversation analytics"
ON public.agent_v2_conversation_analytics
FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- Relationship with agent_prompt_metrics:
-- agent_v2_turn_analytics can be linked to agent_prompt_metrics via conversation_id and turn_id/timestamp
-- agent_prompt_metrics already exists and stores raw token data from provider calls.
-- The Analytics Engine aggregates this into cost and quality metrics.

-- Retention Policy (Conceptual - to be implemented via pg_cron or similar)
-- DELETE FROM public.agent_v2_turn_analytics WHERE created_at < now() - interval '30 days';
-- Agregados (conversation_analytics) permanecem por 12 meses.
