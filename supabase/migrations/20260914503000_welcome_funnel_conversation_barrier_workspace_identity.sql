-- A conversation barrier is routing-sensitive. Fail closed if durable Funnel state
-- for the conversation belongs to a different workspace than the caller.
CREATE OR REPLACE FUNCTION public.get_welcome_funnel_conversation_barrier(p_conversation_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND s.workspace_id IS DISTINCT FROM p_workspace_id)
   THEN 'identity_mismatch'
  WHEN EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND s.workspace_id=p_workspace_id AND s.status='needs_review')
   THEN 'needs_review'
  WHEN EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND s.workspace_id=p_workspace_id AND s.status='running')
   THEN 'running'
  ELSE 'clear' END;
$$;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid) FROM PUBLIC,anon,authenticated,service_role;
