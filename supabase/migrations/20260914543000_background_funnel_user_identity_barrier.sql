-- Final DB-side Funnel barrier: callers that only carry conversation/workspace still
-- resolve the conversation's current user identity durably. This closes the remaining
-- same-workspace/different-user gap across Stage B claims, Customer Turn claims,
-- readiness probes and pending attachment without adding a second competing barrier API.
CREATE OR REPLACE FUNCTION public.has_welcome_funnel_agent_barrier(p_conversation_id uuid,p_workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user_id uuid;
BEGIN
 SELECT c.user_id INTO v_user_id FROM public.conversations c WHERE c.id=p_conversation_id AND c.workspace_id=p_workspace_id;
 IF NOT FOUND OR v_user_id IS NULL THEN RETURN true;END IF;
 RETURN EXISTS(
  SELECT 1 FROM public.welcome_funnel_execution_state s
  WHERE s.conversation_id=p_conversation_id
    AND (s.workspace_id IS DISTINCT FROM p_workspace_id
      OR s.user_id IS DISTINCT FROM v_user_id
      OR s.status IN('running','needs_review'))
 );
END$$;
REVOKE ALL ON FUNCTION public.has_welcome_funnel_agent_barrier(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_welcome_funnel_agent_barrier(uuid,uuid) TO service_role;
