
-- Drop the function again
DROP FUNCTION IF EXISTS public.upsert_agent_v2_turn_analytics(text,uuid,text,text,text,text,text,text,integer,integer,numeric,integer,text,jsonb,text,text[],text[],text[],text,text[]);

-- Recreate the upsert function to ensure it matches the actual table columns
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
    event_id,
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
    error_code,
    brain_version,
    builder_version,
    created_at,
    updated_at
  )
  VALUES (
    'evt_' || md5(p_turn_id || now()::text),
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
    CASE WHEN array_length(p_errors, 1) > 0 THEN p_errors[1] ELSE NULL END,
    'v2',
    '2.0.0',
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
