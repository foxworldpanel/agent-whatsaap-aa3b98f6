-- Give webhook/worker callers one durable conversation-level barrier. A running
-- funnel owns generation; needs_review represents uncertain external side effects.
-- Neither state may be treated as permission to start Agent V3 concurrently.
CREATE OR REPLACE FUNCTION public.get_welcome_funnel_conversation_barrier(p_conversation_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public AS $$
 SELECT CASE
  WHEN EXISTS(
   SELECT 1 FROM public.welcome_funnel_execution_state s
   WHERE s.conversation_id=p_conversation_id AND s.status='needs_review'
  ) THEN 'needs_review'
  WHEN EXISTS(
   SELECT 1 FROM public.welcome_funnel_execution_state s
   WHERE s.conversation_id=p_conversation_id AND s.status='running'
  ) THEN 'running'
  ELSE 'clear'
 END;
$$;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid) TO service_role;
