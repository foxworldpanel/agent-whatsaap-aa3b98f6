-- A transient pre-runtime failure must not burn the entire five-attempt safety
-- budget inside one dispatcher invocation. retry_safe is sealed work, but it only
-- becomes claimable again after a short cooldown. The minute scheduler naturally
-- provides a wider production backoff while preserving prompt manual/fast recovery.

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
   WHERE t.state='retry_safe' AND t.safe_attempt_count<5 AND t.updated_at<=now()-interval '15 seconds'
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id))
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns active_turn WHERE active_turn.conversation_id=t.conversation_id AND active_turn.id<>t.id AND active_turn.state IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active_job WHERE active_job.conversation_id=t.conversation_id AND active_job.status IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks generation_lock WHERE generation_lock.conversation_id=t.conversation_id)
   UNION ALL
   SELECT t.id,t.conversation_id,t.last_received_at AS ready_at
   FROM public.agent_customer_turns t
   WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before AND t.safe_attempt_count<5
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns retry_owner WHERE retry_owner.conversation_id=t.conversation_id AND retry_owner.state='retry_safe')
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns active_turn WHERE active_turn.conversation_id=t.conversation_id AND active_turn.id<>t.id AND active_turn.state IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active_job WHERE active_job.conversation_id=t.conversation_id AND active_job.status IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks generation_lock WHERE generation_lock.conversation_id=t.conversation_id)
     AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=t.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))
  ) q ORDER BY q.ready_at,q.id LIMIT 32
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;

  IF EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id AND a.state IN ('processing_safe','processing'))
  OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_candidate.conversation_id AND j.status IN ('processing_safe','processing'))
  OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_candidate.conversation_id)
  THEN CONTINUE; END IF;

  IF EXISTS(
    SELECT 1 FROM public.agent_customer_turns current_turn
    WHERE current_turn.id=v_candidate.id AND current_turn.conversation_id=v_candidate.conversation_id
      AND ((current_turn.state='collecting' AND EXISTS(SELECT 1 FROM public.agent_customer_turns retry_owner WHERE retry_owner.conversation_id=current_turn.conversation_id AND retry_owner.id<>current_turn.id AND retry_owner.state='retry_safe'))
        OR (current_turn.state='retry_safe' AND (current_turn.updated_at>now()-interval '15 seconds' OR EXISTS(SELECT 1 FROM public.agent_customer_turns older_retry WHERE older_retry.conversation_id=current_turn.conversation_id AND older_retry.id<>current_turn.id AND older_retry.state='retry_safe' AND (older_retry.created_at,older_retry.id)<(current_turn.created_at,current_turn.id)))))
  ) THEN CONTINUE; END IF;

  IF EXISTS(
    SELECT 1 FROM public.agent_customer_turns current_turn
    WHERE current_turn.id=v_candidate.id AND current_turn.state='collecting'
      AND EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=v_candidate.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))
  ) THEN CONTINUE; END IF;

  RETURN QUERY UPDATE public.agent_customer_turns t
  SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
      claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
  WHERE t.id=v_candidate.id AND t.conversation_id=v_candidate.conversation_id AND t.safe_attempt_count<5
    AND ((t.state='retry_safe' AND t.updated_at<=now()-interval '15 seconds' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_candidate.conversation_id AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)))
      OR (t.state='collecting' AND t.last_received_at<=p_quiet_before
        AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns retry_owner WHERE retry_owner.conversation_id=v_candidate.conversation_id AND retry_owner.state='retry_safe')
        AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=v_candidate.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))))
  RETURNING t.*;
  IF FOUND THEN RETURN; END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(
 p_turn_id uuid,p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_customer_turns WHERE id=p_turn_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_conversation_id AND a.id<>p_turn_id AND a.state IN ('processing_safe','processing'))
 OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_conversation_id AND j.status IN ('processing_safe','processing'))
 OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_conversation_id)
 THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
     claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
 WHERE t.id=p_turn_id AND t.conversation_id=v_conversation_id AND t.safe_attempt_count<5
   AND ((t.state='retry_safe' AND t.updated_at<=now()-interval '15 seconds' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)))
     OR (t.state='collecting' AND t.last_received_at<=p_quiet_before
       AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns retry_owner WHERE retry_owner.conversation_id=v_conversation_id AND retry_owner.state='retry_safe')
       AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=v_conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))))
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn(p_quiet_before timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.agent_customer_turns t
  WHERE t.safe_attempt_count<5
    AND ((t.state='retry_safe' AND t.updated_at<=now()-interval '15 seconds' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)))
      OR (t.state='collecting' AND t.last_received_at<=p_quiet_before
        AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe')
        AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs pending_job WHERE pending_job.conversation_id=t.conversation_id AND pending_job.status='pending' AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id))))
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns active_turn WHERE active_turn.conversation_id=t.conversation_id AND active_turn.id<>t.id AND active_turn.state IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active_job WHERE active_job.conversation_id=t.conversation_id AND active_job.status IN ('processing_safe','processing'))
    AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks generation_lock WHERE generation_lock.conversation_id=t.conversation_id)
 );
$$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role;
