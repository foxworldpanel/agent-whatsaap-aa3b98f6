-- Do not let the oldest conversation with a running/review Welcome Funnel poison
-- the background Customer Turn claimant through the trigger-level fail-closed guard.
-- Filter it before lock acquisition and revalidate under the shared seed-31 fence.
CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record;
BEGIN
 FOR v_candidate IN
  SELECT q.id,q.conversation_id,q.ready_at FROM (
   SELECT t.id,t.conversation_id,t.created_at ready_at FROM public.agent_customer_turns t
   WHERE t.state='retry_safe' AND t.safe_attempt_count<5
    AND NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=t.conversation_id AND s.status IN ('running','needs_review'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id))
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id)
   UNION ALL
   SELECT t.id,t.conversation_id,t.last_received_at ready_at FROM public.agent_customer_turns t
   WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before AND t.safe_attempt_count<5
    AND NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=t.conversation_id AND s.status IN ('running','needs_review'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns r WHERE r.conversation_id=t.conversation_id AND r.state='retry_safe')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id)
  ) q ORDER BY q.ready_at,q.id LIMIT 32
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=v_candidate.conversation_id AND s.status IN ('running','needs_review'))
   OR EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id AND a.state IN ('processing_safe','processing'))
   OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_candidate.conversation_id AND j.status IN ('processing_safe','processing'))
   OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_candidate.conversation_id) THEN CONTINUE; END IF;

  IF EXISTS(SELECT 1 FROM public.agent_customer_turns c WHERE c.id=v_candidate.id AND c.conversation_id=v_candidate.conversation_id AND
   ((c.state='collecting' AND EXISTS(SELECT 1 FROM public.agent_customer_turns r WHERE r.conversation_id=c.conversation_id AND r.id<>c.id AND r.state='retry_safe')) OR
    (c.state='retry_safe' AND EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=c.conversation_id AND o.id<>c.id AND o.state='retry_safe' AND (o.created_at,o.id)<(c.created_at,c.id))))) THEN CONTINUE; END IF;

  RETURN QUERY UPDATE public.agent_customer_turns t SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
  WHERE t.id=v_candidate.id AND t.conversation_id=v_candidate.conversation_id AND t.safe_attempt_count<5
   AND NOT EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=t.conversation_id AND s.status IN ('running','needs_review'))
   AND ((t.state='retry_safe' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe' AND (o.created_at,o.id)<(t.created_at,t.id))) OR
        (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns r WHERE r.conversation_id=t.conversation_id AND r.state='retry_safe')))
  RETURNING t.*;
  IF FOUND THEN RETURN; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
