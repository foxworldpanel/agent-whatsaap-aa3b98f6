-- A quarantined Funnel conversation is intentionally not claimable even after its
-- generation lease is released. Keep the readiness probe aligned with the claimant
-- so dispatcher batches can become truly idle instead of reporting phantom work.
CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn(p_quiet_before timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.agent_customer_turns t
 WHERE t.safe_attempt_count<5
  AND ((t.state='retry_safe' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe' AND (o.created_at,o.id)<(t.created_at,t.id)))
    OR (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe')))
  AND NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=t.conversation_id AND s.status IN ('running','needs_review'))
  AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN ('processing_safe','processing'))
  AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN ('processing_safe','processing'))
  AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id));
$$;
REVOKE ALL ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role;
