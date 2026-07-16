-- 0. Requisitos Prévios
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Model Pricing Configuration
CREATE TABLE public.agent_v2_model_pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    model text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    input_price_per_million numeric NOT NULL DEFAULT 0,
    output_price_per_million numeric NOT NULL DEFAULT 0,
    cache_creation_price_per_million numeric NOT NULL DEFAULT 0,
    cache_read_price_per_million numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    source text NOT NULL DEFAULT 'official',
    source_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT pricing_provider_not_empty CHECK (trim(provider) <> ''),
    CONSTRAINT pricing_model_not_empty CHECK (trim(model) <> ''),
    CONSTRAINT pricing_source_not_empty CHECK (trim(source) <> ''),
    CONSTRAINT pricing_currency_not_empty CHECK (trim(currency) <> ''),
    CONSTRAINT pricing_positive_input CHECK (input_price_per_million >= 0),
    CONSTRAINT pricing_positive_output CHECK (output_price_per_million >= 0),
    CONSTRAINT pricing_positive_cache_creation CHECK (cache_creation_price_per_million >= 0),
    CONSTRAINT pricing_positive_cache_read CHECK (cache_read_price_per_million >= 0),
    CONSTRAINT pricing_valid_period CHECK (effective_until IS NULL OR effective_until > effective_from),
    
    CONSTRAINT no_overlapping_prices EXCLUDE USING gist (
        provider WITH =, 
        model WITH =, 
        tstzrange(effective_from, COALESCE(effective_until, 'infinity'::timestamptz), '[)') WITH &&
    )
);

-- Pricing Security
REVOKE ALL ON public.agent_v2_model_pricing FROM anon, authenticated, public;
GRANT ALL ON public.agent_v2_model_pricing TO service_role;
ALTER TABLE public.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY;
-- Sem policy para authenticated.

CREATE INDEX idx_agent_v2_pricing_lookup ON public.agent_v2_model_pricing(provider, model, effective_from DESC);

-- 2. Turn Analytics
CREATE TABLE public.agent_v2_turn_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text NOT NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text NOT NULL,
    turn_id text NOT NULL,
    phone_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    brain_version text NOT NULL DEFAULT 'v2',
    builder_version text NOT NULL,
    execution_mode text NOT NULL,
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
    selected_modules text[] NOT NULL DEFAULT '{}',
    selected_tools text[] NOT NULL DEFAULT '{}',
    selected_tutorials text[] NOT NULL DEFAULT '{}',
    tool_call_count integer NOT NULL DEFAULT 0,
    tool_success_count integer NOT NULL DEFAULT 0,
    tool_failure_count integer NOT NULL DEFAULT 0,
    input_tokens integer NOT NULL DEFAULT 0,
    output_tokens integer NOT NULL DEFAULT 0,
    cache_creation_input_tokens integer NOT NULL DEFAULT 0,
    cache_read_input_tokens integer NOT NULL DEFAULT 0,
    prompt_tokens integer NOT NULL DEFAULT 0,
    cacheable_prefix_tokens integer NOT NULL DEFAULT 0,
    estimated_cost numeric,
    currency text NOT NULL DEFAULT 'USD',
    duration_ms integer NOT NULL DEFAULT 0,
    guard_violations text[] NOT NULL DEFAULT '{}',
    guards_triggered text[] NOT NULL DEFAULT '{}',
    regeneration_count integer NOT NULL DEFAULT 0,
    blocked boolean NOT NULL DEFAULT false,
    fallback_used boolean NOT NULL DEFAULT false,
    state_changed_fields text[] NOT NULL DEFAULT '{}',
    response_chars integer NOT NULL DEFAULT 0,
    quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
    structural_quality_score integer,
    commercial_quality_score integer,
    safety_quality_score integer,
    overall_quality_score integer,
    error_code text,
    prompt_metric_id uuid REFERENCES public.agent_prompt_metrics(id) ON DELETE SET NULL,
    
    -- Constraints
    CONSTRAINT turn_valid_execution_mode CHECK (execution_mode IN ('isolated_test', 'shadow', 'pilot', 'production')),
    CONSTRAINT turn_valid_brain_version CHECK (brain_version = 'v2'),
    CONSTRAINT turn_positive_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0 AND cache_creation_input_tokens >= 0 AND cache_read_input_tokens >= 0 AND prompt_tokens >= 0 AND cacheable_prefix_tokens >= 0),
    CONSTRAINT turn_positive_duration CHECK (duration_ms >= 0),
    CONSTRAINT turn_positive_chars CHECK (response_chars >= 0),
    CONSTRAINT turn_positive_counts CHECK (tool_call_count >= 0 AND tool_success_count >= 0 AND tool_failure_count >= 0),
    CONSTRAINT turn_tool_coherence CHECK (tool_success_count + tool_failure_count <= tool_call_count),
    CONSTRAINT turn_valid_regeneration CHECK (regeneration_count BETWEEN 0 AND 1),
    CONSTRAINT turn_valid_scores_overall CHECK (overall_quality_score IS NULL OR overall_quality_score BETWEEN 0 AND 100),
    CONSTRAINT turn_valid_scores_structural CHECK (structural_quality_score IS NULL OR structural_quality_score BETWEEN 0 AND 100),
    CONSTRAINT turn_valid_scores_commercial CHECK (commercial_quality_score IS NULL OR commercial_quality_score BETWEEN 0 AND 100),
    CONSTRAINT turn_valid_scores_safety CHECK (safety_quality_score IS NULL OR safety_quality_score BETWEEN 0 AND 100),
    CONSTRAINT turn_positive_cost CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    CONSTRAINT turn_currency_not_empty CHECK (trim(currency) <> ''),
    
    CONSTRAINT turn_analytics_unique_turn UNIQUE (workspace_id, conversation_id, turn_id)
);

-- Turn Security
REVOKE ALL ON public.agent_v2_turn_analytics FROM anon, authenticated, public;
GRANT SELECT ON public.agent_v2_turn_analytics TO authenticated;
GRANT ALL ON public.agent_v2_turn_analytics TO service_role;
ALTER TABLE public.agent_v2_turn_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_v2_turn_select ON public.agent_v2_turn_analytics
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.workspaces w 
        WHERE w.id = agent_v2_turn_analytics.workspace_id AND w.user_id = auth.uid()
    ));

-- Índices Turnos
CREATE INDEX idx_turn_v2_workspace_created ON public.agent_v2_turn_analytics(workspace_id, created_at DESC);
CREATE INDEX idx_turn_v2_workspace_mode_created ON public.agent_v2_turn_analytics(workspace_id, execution_mode, created_at DESC);
CREATE INDEX idx_turn_v2_conversation ON public.agent_v2_turn_analytics(workspace_id, conversation_id);
CREATE INDEX idx_turn_v2_network ON public.agent_v2_turn_analytics(workspace_id, network, created_at DESC);
CREATE INDEX idx_turn_v2_stage ON public.agent_v2_turn_analytics(workspace_id, customer_stage, created_at DESC);
CREATE INDEX idx_turn_v2_prompt_metric ON public.agent_v2_turn_analytics(prompt_metric_id) WHERE prompt_metric_id IS NOT NULL;


-- 3. Conversation Analytics (Aggregated)
CREATE TABLE public.agent_v2_conversation_analytics (
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    conversation_id text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    mode text NOT NULL,
    primary_network text,
    primary_service text,
    total_turns integer NOT NULL DEFAULT 0,
    customer_turns integer NOT NULL DEFAULT 0,
    agent_turns integer NOT NULL DEFAULT 0,
    llm_calls integer NOT NULL DEFAULT 0,
    deterministic_turns integer NOT NULL DEFAULT 0,
    tool_calls integer NOT NULL DEFAULT 0,
    tool_failures integer NOT NULL DEFAULT 0,
    model_fallbacks integer NOT NULL DEFAULT 0,
    guard_violations integer NOT NULL DEFAULT 0,
    regenerations integer NOT NULL DEFAULT 0,
    blocked_responses integer NOT NULL DEFAULT 0,
    repeated_question_count integer NOT NULL DEFAULT 0,
    wrong_platform_count integer NOT NULL DEFAULT 0,
    wrong_service_count integer NOT NULL DEFAULT 0,
    wrong_price_count integer NOT NULL DEFAULT 0,
    support_redirect_count integer NOT NULL DEFAULT 0,
    free_test_offered boolean NOT NULL DEFAULT false,
    free_test_started boolean NOT NULL DEFAULT false,
    free_test_completed boolean NOT NULL DEFAULT false,
    panel_guidance_started boolean NOT NULL DEFAULT false,
    reached_registration boolean NOT NULL DEFAULT false,
    reached_recharge boolean NOT NULL DEFAULT false,
    reached_order_step boolean NOT NULL DEFAULT false,
    panel_journey_completed boolean NOT NULL DEFAULT false,
    final_intent text,
    final_step text,
    total_input_tokens integer NOT NULL DEFAULT 0,
    total_output_tokens integer NOT NULL DEFAULT 0,
    total_cache_creation_tokens integer NOT NULL DEFAULT 0,
    total_cache_read_tokens integer NOT NULL DEFAULT 0,
    total_estimated_cost numeric NOT NULL DEFAULT 0,
    average_duration_ms numeric NOT NULL DEFAULT 0,
    structural_quality_score integer NOT NULL DEFAULT 0,
    commercial_quality_score integer NOT NULL DEFAULT 0,
    safety_quality_score integer NOT NULL DEFAULT 0,
    overall_quality_score integer NOT NULL DEFAULT 0,
    conversion_stage text,
    close_reason text,
    
    -- Constraints
    CONSTRAINT conv_positive_turns CHECK (total_turns >= 0 AND customer_turns >= 0 AND agent_turns >= 0),
    CONSTRAINT conv_positive_llm_calls CHECK (llm_calls >= 0),
    CONSTRAINT conv_positive_det_turns CHECK (deterministic_turns >= 0),
    CONSTRAINT conv_positive_tools CHECK (tool_calls >= 0 AND tool_failures >= 0),
    CONSTRAINT conv_positive_metrics CHECK (model_fallbacks >= 0 AND guard_violations >= 0 AND regenerations >= 0 AND blocked_responses >= 0),
    CONSTRAINT conv_positive_errors CHECK (repeated_question_count >= 0 AND wrong_platform_count >= 0 AND wrong_service_count >= 0 AND wrong_price_count >= 0 AND support_redirect_count >= 0),
    CONSTRAINT conv_positive_tokens CHECK (total_input_tokens >= 0 AND total_output_tokens >= 0 AND total_cache_creation_tokens >= 0 AND total_cache_read_tokens >= 0),
    CONSTRAINT conv_positive_cost CHECK (total_estimated_cost >= 0),
    CONSTRAINT conv_positive_duration CHECK (average_duration_ms >= 0),
    CONSTRAINT conv_valid_scores CHECK (
        overall_quality_score BETWEEN 0 AND 100 AND 
        structural_quality_score BETWEEN 0 AND 100 AND 
        commercial_quality_score BETWEEN 0 AND 100 AND 
        safety_quality_score BETWEEN 0 AND 100
    ),
    CONSTRAINT conv_turn_coherence CHECK (llm_calls + deterministic_turns <= total_turns),
    CONSTRAINT conv_tool_coherence CHECK (tool_failures <= tool_calls),
    CONSTRAINT conv_valid_period CHECK (ended_at IS NULL OR ended_at >= started_at),
    
    PRIMARY KEY (workspace_id, conversation_id)
);

-- Conversation Security
REVOKE ALL ON public.agent_v2_conversation_analytics FROM anon, authenticated, public;
GRANT SELECT ON public.agent_v2_conversation_analytics TO authenticated;
GRANT ALL ON public.agent_v2_conversation_analytics TO service_role;
ALTER TABLE public.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_v2_conversation_select ON public.agent_v2_conversation_analytics
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.workspaces w 
        WHERE w.id = agent_v2_conversation_analytics.workspace_id AND w.user_id = auth.uid()
    ));

-- Índices Conversas
CREATE INDEX idx_conv_v2_workspace_updated ON public.agent_v2_conversation_analytics(workspace_id, updated_at DESC);
CREATE INDEX idx_conv_v2_network ON public.agent_v2_conversation_analytics(workspace_id, primary_network);
CREATE INDEX idx_conv_v2_stage ON public.agent_v2_conversation_analytics(workspace_id, conversion_stage);

-- 4. Função de Cleanup (Retenção)
CREATE OR REPLACE FUNCTION public.cleanup_agent_v2_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Limpeza de turnos detalhados após 30 dias
    DELETE FROM public.agent_v2_turn_analytics
    WHERE created_at < now() - interval '30 days';
    
    -- Limpeza de conversas agregadas inativas há 12 meses
    DELETE FROM public.agent_v2_conversation_analytics
    WHERE ended_at IS NOT NULL
      AND COALESCE(ended_at, updated_at) < now() - interval '12 months';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_agent_v2_analytics() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;

-- 5. Função SQL para UPSERT Idempotente (Prevenção de Regressão)
CREATE OR REPLACE FUNCTION public.upsert_agent_v2_turn_analytics(p_turn public.agent_v2_turn_analytics)
RETURNS public.agent_v2_turn_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result public.agent_v2_turn_analytics;
BEGIN
    INSERT INTO public.agent_v2_turn_analytics (
        event_id, workspace_id, conversation_id, turn_id, phone_hash,
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
        structural_quality_score, commercial_quality_score,
        safety_quality_score, overall_quality_score, error_code, prompt_metric_id
    )
    VALUES (
        p_turn.event_id, p_turn.workspace_id, p_turn.conversation_id, p_turn.turn_id, p_turn.phone_hash,
        p_turn.brain_version, p_turn.builder_version, p_turn.execution_mode, p_turn.sent_to_customer,
        p_turn.mode, p_turn.network, p_turn.service, p_turn.intent, p_turn.current_step, p_turn.customer_stage,
        p_turn.used_llm, p_turn.deterministic_resolution, p_turn.selected_model, p_turn.routing_reason,
        p_turn.complexity, p_turn.selected_modules, p_turn.selected_tools, p_turn.selected_tutorials,
        p_turn.tool_call_count, p_turn.tool_success_count, p_turn.tool_failure_count,
        p_turn.input_tokens, p_turn.output_tokens, p_turn.cache_creation_input_tokens,
        p_turn.cache_read_input_tokens, p_turn.prompt_tokens, p_turn.cacheable_prefix_tokens,
        p_turn.estimated_cost, p_turn.currency, p_turn.duration_ms, p_turn.guard_violations,
        p_turn.guards_triggered, p_turn.regeneration_count, p_turn.blocked, p_turn.fallback_used,
        p_turn.state_changed_fields, p_turn.response_chars, p_turn.quality_flags,
        p_turn.structural_quality_score, p_turn.commercial_quality_score,
        p_turn.safety_quality_score, p_turn.overall_quality_score, p_turn.error_code, p_turn.prompt_metric_id
    )
    ON CONFLICT (workspace_id, conversation_id, turn_id)
    DO UPDATE SET
        updated_at = now(),
        regeneration_count = GREATEST(agent_v2_turn_analytics.regeneration_count, EXCLUDED.regeneration_count),
        tool_call_count = GREATEST(agent_v2_turn_analytics.tool_call_count, EXCLUDED.tool_call_count),
        tool_success_count = GREATEST(agent_v2_turn_analytics.tool_success_count, EXCLUDED.tool_success_count),
        tool_failure_count = GREATEST(agent_v2_turn_analytics.tool_failure_count, EXCLUDED.tool_failure_count),
        sent_to_customer = agent_v2_turn_analytics.sent_to_customer OR EXCLUDED.sent_to_customer,
        blocked = agent_v2_turn_analytics.blocked OR EXCLUDED.blocked,
        input_tokens = CASE WHEN EXCLUDED.input_tokens > 0 THEN EXCLUDED.input_tokens ELSE agent_v2_turn_analytics.input_tokens END,
        output_tokens = CASE WHEN EXCLUDED.output_tokens > 0 THEN EXCLUDED.output_tokens ELSE agent_v2_turn_analytics.output_tokens END,
        estimated_cost = COALESCE(EXCLUDED.estimated_cost, agent_v2_turn_analytics.estimated_cost),
        prompt_metric_id = COALESCE(agent_v2_turn_analytics.prompt_metric_id, EXCLUDED.prompt_metric_id)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;