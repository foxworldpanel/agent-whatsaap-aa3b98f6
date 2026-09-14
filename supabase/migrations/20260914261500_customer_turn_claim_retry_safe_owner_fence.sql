-- retry_safe is sealed older semantic work. A collecting successor must never
-- start while any retry_safe predecessor remains for the conversation. Discovery
-- already filters this for collecting turns; repeat the invariant after acquiring
-- seed 31 so a recovery transition to retry_safe cannot race the claim.

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(
 p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record;
BEGIN
 FOR v_candidate IN
  SELECT q.id,q.conversation_id,q.ready_at
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
  ) q
  ORDER BY q.ready_at,q.id
  LIMIT 32
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN
   CONTINUE;
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.agent_customer_turns a
    WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id
      AND a.state IN ('processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_inbound_jobs j
    WHERE j.conversation_id=v_candidate.conversation_id
      AND j.status IN ('processing_safe','processing')
  ) OR EXISTS(
    SELECT 1 FROM public.agent_generation_locks g
    WHERE g.conversation_id=v_candidate.conversation_id
  ) THEN CONTINUE; END IF;

  -- This second check is deliberately under the advisory fence. If the candidate
  -- is collecting and an older claim was recovered to retry_safe after discovery,
  -- preserve semantic order instead of letting the successor overtake it.
  IF EXISTS(
    SELECT 1 FROM public.agent_customer_turns predecessor
    WHERE predecessor.conversation_id=v_candidate.conversation_id
      AND predecessor.id<>v_candidate.id
      AND predecessor.state='retry_safe'
  ) THEN
    CONTINUE;
  END IF;

  RETURN QUERY UPDATE public.agent_customer_turns t
  SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
      claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
  WHERE t.id=v_candidate.id
    AND t.conversation_id=v_candidate.conversation_id
    AND t.safe_attempt_count<5
    AND ((t.state='retry_safe' AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_candidate.conversation_id
        AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
    )) OR (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=v_candidate.conversation_id AND older.state='retry_safe'
    )))
  RETURNING t.*;

  IF FOUND THEN RETURN; END IF;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
