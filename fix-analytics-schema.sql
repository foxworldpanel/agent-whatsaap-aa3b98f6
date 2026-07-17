-- 1. Correct the column name in agent_v2_turn_analytics if it exists with the wrong name, or add it correctly.
-- Looking at the error "column customer_stage_id does not exist", but maybe it's being referenced inside the RPC.

-- Let's check the current structure of the table and the function.
-- I will just recreate the function to match the current table columns.

CREATE OR REPLACE FUNCTION public.upsert_agent_v2_turn_analytics(
  p_turn_id text,
  p_workspace_id uuid,
  p_conversation_id text,
  p_phone_hash text,
  p_intent text,
  p_network text,
  p_service text,
  p_selected_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost numeric,
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
    estimated_cost,
    duration_ms,
    routing_reason,
    quality_flags,
    customer_stage,
    selected_modules,
    selected_tools,
    selected_tutorials,
    execution_mode,
    errors,
    created_at,
    updated_at
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
    p_estimated_cost,
    p_duration_ms,
    p_routing_reason,
    p_quality_flags,
    p_customer_stage,
    p_selected_modules,
    p_selected_tools,
    p_selected_tutorials,
    p_execution_mode,
    p_errors,
    now(),
    now()
  )
  ON CONFLICT (workspace_id, conversation_id, turn_id)
  DO UPDATE SET
    intent = EXCLUDED.intent,
    network = EXCLUDED.network,
    service = EXCLUDED.service,
    selected_model = EXCLUDED.selected_model,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    estimated_cost = EXCLUDED.estimated_cost,
    duration_ms = EXCLUDED.duration_ms,
    quality_flags = EXCLUDED.quality_flags,
    customer_stage = EXCLUDED.customer_stage,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics TO authenticated, service_role;
