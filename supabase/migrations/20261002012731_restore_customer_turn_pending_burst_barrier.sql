-- Restore semantic burst barriers lost when background claim/readiness was redefined
-- for Welcome Funnel workspace identity. Keep the newer funnel barrier while
-- restoring pending-inbound, unattached-review, and retry cooldown predicates.
CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record;
BEGIN
 FOR v_candidate IN SELECT q.id,q.conversation_id,q.workspace_id,q.ready_at FROM(
  SELECT t.id,t.conversation_id,t.workspace_id,t.created_at ready_at FROM public.agent_customer_turns t
  WHERE t.state='retry_safe' AND t.safe_attempt_count<5 AND t.updated_at<=now()-interval '15 seconds'
   AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at)
   AND NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe' AND(o.created_at,o.id)<(t.created_at,t.id))
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN('processing_safe','processing'))
   AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN('processing_safe','processing'))
   AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id)
  UNION ALL
  SELECT t.id,t.conversation_id,t.workspace_id,t.last_received_at FROM public.agent_customer_turns t
  WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before AND t.safe_attempt_count<5
   AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,NULL)
   AND NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns r WHERE r.conversation_id=t.conversation_id AND r.state='retry_safe')
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN('processing_safe','processing'))
   AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN('processing_safe','processing'))
   AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id)
   AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=t.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))
 )q ORDER BY q.ready_at,q.id LIMIT 32 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE;END IF;
  IF public.has_welcome_funnel_agent_barrier(v_candidate.conversation_id,v_candidate.workspace_id)
   OR EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id AND a.state IN('processing_safe','processing'))
   OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_candidate.conversation_id AND j.status IN('processing_safe','processing'))
   OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_candidate.conversation_id) THEN CONTINUE;END IF;
  RETURN QUERY UPDATE public.agent_customer_turns t
   SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
   WHERE t.id=v_candidate.id AND t.safe_attempt_count<5
    AND NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)
    AND ((t.state='retry_safe' AND t.updated_at<=now()-interval '15 seconds'
      AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at)
      AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe' AND(o.created_at,o.id)<(t.created_at,t.id)))
     OR(t.state='collecting' AND t.last_received_at<=p_quiet_before
      AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,NULL)
      AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns r WHERE r.conversation_id=t.conversation_id AND r.state='retry_safe')
      AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=t.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))))
   RETURNING t.*;
  IF FOUND THEN RETURN;END IF;
 END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn(p_quiet_before timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.safe_attempt_count<5
  AND ((t.state='retry_safe' AND t.updated_at<=now()-interval '15 seconds'
    AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at)
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe' AND(o.created_at,o.id)<(t.created_at,t.id)))
   OR(t.state='collecting' AND t.last_received_at<=p_quiet_before
    AND NOT public.agent_turn_has_blocking_unattached_review(t.conversation_id,NULL)
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns o WHERE o.conversation_id=t.conversation_id AND o.state='retry_safe')
    AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=t.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))))
  AND NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)
  AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.id<>t.id AND a.state IN('processing_safe','processing'))
  AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN('processing_safe','processing'))
  AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=t.conversation_id));
$$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role;
