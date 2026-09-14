-- claim_next previously selected the globally oldest ready row first and only
-- then discovered that its conversation was fenced. One busy Welcome Funnel or
-- active legacy Stage B owner could therefore head-of-line block unrelated
-- conversations for repeated dispatcher attempts. Filter durable owners during
-- candidate discovery, then keep the advisory-locked recheck for correctness.

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(
 p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid;
BEGIN
 SELECT q.id,q.conversation_id INTO v_candidate_id,v_conversation_id
 FROM (
  SELECT t.id,t.conversation_id,t.created_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='retry_safe' AND t.safe_attempt_count<5
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns active_turn
      WHERE active_turn.conversation_id=t.conversation_id AND active_turn.id<>t.id
        AND active_turn.state IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active_job
      WHERE active_job.conversation_id=t.conversation_id
        AND active_job.status IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_generation_locks generation_lock
      WHERE generation_lock.conversation_id=t.conversation_id
    )
  UNION ALL
  SELECT t.id,t.conversation_id,t.last_received_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
    AND t.safe_attempt_count<5
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe'
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns active_turn
      WHERE active_turn.conversation_id=t.conversation_id AND active_turn.id<>t.id
        AND active_turn.state IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active_job
      WHERE active_job.conversation_id=t.conversation_id
        AND active_job.status IN ('processing_safe','processing')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_generation_locks generation_lock
      WHERE generation_lock.conversation_id=t.conversation_id
    )
 ) q ORDER BY q.ready_at,q.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 -- Discovery filters are only an optimization. Ownership can change before the
 -- advisory lock is acquired, so re-check every durable owner under the fence.
 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>v_candidate_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_generation_locks g
   WHERE g.conversation_id=v_conversation_id
 ) THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
     claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
 WHERE t.id=v_candidate_id AND t.conversation_id=v_conversation_id AND t.safe_attempt_count<5
 AND ((t.state='retry_safe' AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id
   AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)
 )) OR (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
 ))) RETURNING t.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
