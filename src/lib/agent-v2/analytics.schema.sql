-- Analytics Engine V2 - Database Schema
-- Revisão completa para aprovação de migração.

-- 1. Model Pricing Configuration
CREATE TABLE public.agent_v2_model_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    model text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz, -- Nullable, for historical versioning
    input_price_per_million numeric NOT NULL,
    output_price_per_million numeric NOT NULL,
    cache_creation_price_per_million numeric NOT NULL,
    cache_read_price_per_million numeric NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    source text NOT NULL DEFAULT 'official',
    source_url text, -- Official reference URL
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Prevent overlapping configurations for the same provider/model and period
    CONSTRAINT no_overlapping_prices EXCLUDE USING gist (
        provider WITH =, 
        model WITH =, 
        tstzrange(effective_from, COALESCE(effective_until, 'infinity')) WITH &&
    )
);

-- Note: GiST EXCLUDE requires btree_gist extension. 
-- In managed Supabase/Lovable Cloud, this usually requires: CREATE EXTENSION IF NOT EXISTS btree_gist;

GRANT SELECT ON public.agent_v2_model_pricing TO authenticated;
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
    event_id text NOT NULL, -- Logical event ID from orchestrator
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text NOT NULL,
    turn_id text NOT NULL, -- Unique turn sequence ID within conversation
    phone_hash text NOT NULL, -- Irreversible HMAC hash
    created_at timestamptz NOT NULL DEFAULT now(),
    brain_version text NOT NULL,
    builder_version text NOT NULL,
    execution_mode text NOT NULL, -- isolated_test, shadow, pilot, production
    sent_to_customer boolean NOT NULL DEFAULT false,
    mode text NOT NULL, -- receptive, outbound
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
    estimated_cost numeric, -- Calculated at creation, null if pricing missing
    currency text DEFAULT 'USD',
    duration_ms integer NOT NULL,
    guard_violations text[],
    guards_triggered text[],
    regeneration_count integer DEFAULT 0,
    blocked boolean DEFAULT false,
    fallback_used boolean DEFAULT false,
    state_changed_fields text[],
    response_chars integer DEFAULT 0,
    quality_flags jsonb, -- Map of boolean flags
    structural_quality_score integer, -- 0-100
    commercial_quality_score integer, -- 0-100
    safety_quality_score integer, -- 0-100
    overall_quality_score integer, -- 0-100
    error_code text,
    prompt_metric_id uuid, -- Link to legacy agent_prompt_metrics if applicable
    
    -- Idempotency constraint: workspace + conversation + turn
    CONSTRAINT turn_analytics_unique_turn UNIQUE (workspace_id, conversation_id, turn_id)
);

GRANT SELECT ON public.agent_v2_turn_analytics TO authenticated;
GRANT ALL ON public.agent_v2_turn_analytics TO service_role;
ALTER TABLE public.agent_v2_turn_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their workspace analytics"
ON public.agent_v2_turn_analytics
FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE INDEX idx_turn_v2_workspace_created ON public.agent_v2_turn_analytics(workspace_id, created_at);
CREATE INDEX idx_turn_v2_conversation ON public.agent_v2_turn_analytics(conversation_id);
CREATE INDEX idx_turn_v2_execution_mode ON public.agent_v2_turn_analytics(execution_mode);
CREATE INDEX idx_turn_v2_intent ON public.agent_v2_turn_analytics(intent);
CREATE INDEX idx_turn_v2_selected_model ON public.agent_v2_turn_analytics(selected_model);
CREATE INDEX idx_turn_v2_blocked ON public.agent_v2_turn_analytics(blocked) WHERE blocked = true;
CREATE INDEX idx_turn_v2_quality ON public.agent_v2_turn_analytics(overall_quality_score);

-- 3. Conversation Analytics (Aggregated)
CREATE TABLE public.agent_v2_conversation_analytics (
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text NOT NULL,
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
    structural_quality_score integer DEFAULT 0,
    commercial_quality_score integer DEFAULT 0,
    safety_quality_score integer DEFAULT 0,
    overall_quality_score integer DEFAULT 0,
    conversion_stage text,
    close_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    PRIMARY KEY (workspace_id, conversation_id)
);

GRANT SELECT ON public.agent_v2_conversation_analytics TO authenticated;
GRANT ALL ON public.agent_v2_conversation_analytics TO service_role;
ALTER TABLE public.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their workspace conversation analytics"
ON public.agent_v2_conversation_analytics
FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Relationship with agent_prompt_metrics:
-- agent_v2_turn_analytics is the source of truth for V2 metrics.
-- prompt_metric_id links to legacy agent_prompt_metrics if correlation is needed.
-- Failures in one should not block the other.

-- Retention Strategy:
-- Turn Analytics (detailed): 30 days.
-- Conversation Analytics (aggregated): 12 months.
-- Cleanup function to be called by service role / cron.

CREATE OR REPLACE FUNCTION public.cleanup_agent_v2_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Delete old turns (detailed data)
    DELETE FROM public.agent_v2_turn_analytics 
    WHERE created_at < now() - interval '30 days';
    
    -- Delete old conversations (aggregated data)
    DELETE FROM public.agent_v2_conversation_analytics
    WHERE created_at < now() - interval '12 months';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;

