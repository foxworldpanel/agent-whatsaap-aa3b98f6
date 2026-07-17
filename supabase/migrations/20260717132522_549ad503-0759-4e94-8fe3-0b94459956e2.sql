DROP FUNCTION IF EXISTS public.upsert_agent_v2_turn_analytics(agent_v2_turn_analytics);
DROP FUNCTION IF EXISTS public.upsert_agent_v2_turn_analytics(jsonb);

CREATE OR REPLACE FUNCTION public.upsert_agent_v2_turn_analytics(
    p_turn_id text,
    p_workspace_id uuid,
    p_conversation_id uuid,
    p_phone_hash text,
    p_intent text,
    p_network text,
    p_service text,
    p_selected_model text,
    p_input_tokens integer,
    p_output_tokens integer,
    p_estimated_cost_usd numeric,
    p_duration_ms integer,
    p_routing_reason text,
    p_quality_flags jsonb,
    p_customer_stage text,
    p_selected_modules text[],
    p_selected_tools text[],
    p_selected_tutorials text[],
    p_execution_mode text,
    p_errors text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.agent_v2_turn_analytics (
        turn_id,
        workspace_id,
        conversation_id,
        phone_hash,
        intent,
        network,
        service,
        selected_model,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        duration_ms,
        routing_reason,
        quality_flags,
        customer_stage,
        selected_modules,
        selected_tools,
        selected_tutorials,
        execution_mode,
        errors,
        created_at
    )
    VALUES (
        p_turn_id,
        p_workspace_id,
        p_conversation_id,
        p_phone_hash,
        p_intent,
        p_network,
        p_service,
        p_selected_model,
        p_input_tokens,
        p_output_tokens,
        p_estimated_cost_usd,
        p_duration_ms,
        p_routing_reason,
        p_quality_flags,
        p_customer_stage,
        p_selected_modules,
        p_selected_tools,
        p_selected_tutorials,
        p_execution_mode,
        p_errors,
        now()
    )
    ON CONFLICT (turn_id) DO UPDATE SET
        intent = EXCLUDED.intent,
        network = EXCLUDED.network,
        service = EXCLUDED.service,
        selected_model = EXCLUDED.selected_model,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        estimated_cost_usd = EXCLUDED.estimated_cost_usd,
        duration_ms = EXCLUDED.duration_ms,
        routing_reason = EXCLUDED.routing_reason,
        quality_flags = EXCLUDED.quality_flags,
        customer_stage = EXCLUDED.customer_stage,
        selected_modules = EXCLUDED.selected_modules,
        selected_tools = EXCLUDED.selected_tools,
        selected_tutorials = EXCLUDED.selected_tutorials,
        execution_mode = EXCLUDED.execution_mode,
        errors = EXCLUDED.errors;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics TO service_role;
