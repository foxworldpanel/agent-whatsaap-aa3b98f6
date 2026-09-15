-- The previous under-fence retry_safe recheck treated every other retry_safe turn
-- as a predecessor. With two retry_safe turns, that could block the oldest turn
-- because a newer retry_safe sibling existed. Revalidate ordering by candidate
-- state: collecting is blocked by any retry_safe owner; retry_safe is blocked only
-- by an actually older retry_safe turn.

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
       SELECT 1 FROM public.agent_customer_turns retry_owner
       WHERE retry_owner.conversation_id=t.conversation_id AND retry_owner.state='retry_safe'
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

  -- Recheck semantic predecessor ownership under the shared conversation fence.
  -- A newer retry_safe sibling must not block the oldest retry_safe candidate.
  IF EXISTS(
    SELECT 1
    FROM public.agent_customer_turns current_turn
    WHERE current_turn.id=v_candidate.id
      AND current_turn.conversation_id=v_candidate.conversation_id
      AND (
        (current_turn.state='collecting' AND EXISTS(
          SELECT 1 FROM public.agent_customer_turns retry_owner
          WHERE retry_owner.conversation_id=current_turn.conversation_id
            AND retry_owner.id<>current_turn.id
            AND retry_owner.state='retry_safe'
        ))
        OR
        (current_turn.state='retry_safe' AND EXISTS(
          SELECT 1 FROM public.agent_customer_turns older_retry
          WHERE older_retry.conversation_id=current_turn.conversation_id
            AND older_retry.id<>current_turn.id
            AND older_retry.state='retry_safe'
            AND (older_retry.created_at,older_retry.id)<(current_turn.created_at,current_turn.id)
        ))
      )
  ) THEN CONTINUE; END IF;

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
      SELECT 1 FROM public.agent_customer_turns retry_owner
      WHERE retry_owner.conversation_id=v_candidate.conversation_id AND retry_owner.state='retry_safe'
    )))
  RETURNING t.*;

  IF FOUND THEN RETURN; END IF;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
