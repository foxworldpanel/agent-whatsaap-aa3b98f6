-- Analytics Engine V2 - Database Schema
-- Revisão integral para aprovação final de migração.

-- 0. Requisitos Prévios
-- GiST EXCLUDE requer btree_gist extension.
-- CREATE EXTENSION IF NOT EXISTS btree_gist;

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
    
    -- Constraints de Validação
    CONSTRAINT pricing_positive_input_price CHECK (input_price_per_million >= 0),
    CONSTRAINT pricing_positive_output_price CHECK (output_price_per_million >= 0),
    CONSTRAINT pricing_positive_cache_creation_price CHECK (cache_creation_price_per_million >= 0),
    CONSTRAINT pricing_positive_cache_read_price CHECK (cache_read_price_per_million >= 0),
    CONSTRAINT pricing_valid_period CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT pricing_currency_not_empty CHECK (length(currency) > 0),
    
    -- Prevenção de períodos sobrepostos (Uso de [) para permitir adjacência exata)
    CONSTRAINT no_overlapping_prices EXCLUDE USING gist (
        provider WITH =, 
        model WITH =, 
        tstzrange(effective_from, COALESCE(effective_until, 'infinity'::timestamptz), '[)') WITH &&
    )
);

-- Segurança Pricing
REVOKE ALL ON public.agent_v2_model_pricing FROM anon;
REVOKE ALL ON public.agent_v2_model_pricing FROM authenticated;
GRANT SELECT ON public.agent_v2_model_pricing TO authenticated;
GRANT ALL ON public.agent_v2_model_pricing TO service_role;
ALTER TABLE public.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_v2_model_pricing_select ON public.agent_v2_model_pricing
    FOR SELECT TO authenticated USING (true);

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
    brain_version text NOT NULL,
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
    currency text DEFAULT 'USD',
    duration_ms integer NOT NULL DEFAULT 0,
    guard_violations text[],
    guards_triggered text[],
    regeneration_count integer DEFAULT 0,
    blocked boolean DEFAULT false,
    fallback_used boolean DEFAULT false,
    state_changed_fields text[],
    response_chars integer DEFAULT 0,
    quality_flags jsonb DEFAULT '{}'::jsonb,
    structural_quality_score integer,
    commercial_quality_score integer,
    safety_quality_score integer,
    overall_quality_score integer,
    error_code text,
    prompt_metric_id uuid REFERENCES public.agent_prompt_metrics(id) ON DELETE SET NULL,
    
    -- Constraints de Validação
    CONSTRAINT turn_valid_execution_mode CHECK (execution_mode IN ('isolated_test', 'shadow', 'pilot', 'production')),
    CONSTRAINT turn_valid_brain_version CHECK (brain_version LIKE 'v2%'),
    CONSTRAINT turn_positive_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0 AND cache_creation_input_tokens >= 0 AND cache_read_input_tokens >= 0),
    CONSTRAINT turn_positive_duration CHECK (duration_ms >= 0),
    CONSTRAINT turn_positive_counts CHECK (tool_call_count >= 0 AND tool_success_count >= 0 AND tool_failure_count >= 0),
    CONSTRAINT turn_valid_regeneration CHECK (regeneration_count BETWEEN 0 AND 1),
    CONSTRAINT turn_valid_scores CHECK (
        (structural_quality_score IS NULL OR structural_quality_score BETWEEN 0 AND 100) AND
        (commercial_quality_score IS NULL OR commercial_quality_score BETWEEN 0 AND 100) AND
        (safety_quality_score IS NULL OR safety_quality_score BETWEEN 0 AND 100) AND
        (overall_quality_score IS NULL OR overall_quality_score BETWEEN 0 AND 100)
    ),
    CONSTRAINT turn_positive_cost CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    
    -- Idempotência: workspace + conversation + turn
    CONSTRAINT turn_analytics_unique_turn UNIQUE (workspace_id, conversation_id, turn_id)
);

-- Segurança Turn Analytics
REVOKE ALL ON public.agent_v2_turn_analytics FROM anon;
REVOKE ALL ON public.agent_v2_turn_analytics FROM authenticated;
GRANT SELECT ON public.agent_v2_turn_analytics TO authenticated;
GRANT ALL ON public.agent_v2_turn_analytics TO service_role;
ALTER TABLE public.agent_v2_turn_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_v2_turn_analytics_select ON public.agent_v2_turn_analytics
    FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

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
    
    -- Constraints de Validação
    CONSTRAINT conv_positive_turns CHECK (total_turns >= 0 AND customer_turns >= 0 AND agent_turns >= 0),
    CONSTRAINT conv_positive_tokens CHECK (total_input_tokens >= 0 AND total_output_tokens >= 0),
    CONSTRAINT conv_positive_cost CHECK (total_estimated_cost >= 0),
    CONSTRAINT conv_valid_scores CHECK (
        overall_quality_score BETWEEN 0 AND 100 AND
        structural_quality_score BETWEEN 0 AND 100 AND
        commercial_quality_score BETWEEN 0 AND 100 AND
        safety_quality_score BETWEEN 0 AND 100
    ),
    
    PRIMARY KEY (workspace_id, conversation_id)
);

-- Segurança Conversation Analytics
REVOKE ALL ON public.agent_v2_conversation_analytics FROM anon;
REVOKE ALL ON public.agent_v2_conversation_analytics FROM authenticated;
GRANT SELECT ON public.agent_v2_conversation_analytics TO authenticated;
GRANT ALL ON public.agent_v2_conversation_analytics TO service_role;
ALTER TABLE public.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_v2_conversation_analytics_select ON public.agent_v2_conversation_analytics
    FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

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
    -- 1. Limpeza de turnos detalhados após 30 dias
    DELETE FROM public.agent_v2_turn_analytics 
    WHERE created_at < now() - interval '30 days';
    
    -- 2. Limpeza de conversas agregadas após 12 meses
    -- Somente se a conversa não estiver mais ativa (ended_at ou updated_at antigo)
    DELETE FROM public.agent_v2_conversation_analytics
    WHERE COALESCE(ended_at, updated_at) < now() - interval '12 months';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_agent_v2_analytics() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;

-- 5. Rollback Script (Manual)
/*
DROP FUNCTION IF EXISTS public.cleanup_agent_v2_analytics();
DROP TABLE IF EXISTS public.agent_v2_conversation_analytics;
DROP TABLE IF EXISTS public.agent_v2_turn_analytics;
DROP TABLE IF EXISTS public.agent_v2_model_pricing;
*/
