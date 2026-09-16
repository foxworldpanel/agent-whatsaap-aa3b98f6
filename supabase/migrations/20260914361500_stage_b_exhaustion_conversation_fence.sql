-- Quarantine exhausted pending work conversation-by-conversation under the shared
-- nonblocking seed-31 fence, then claim ordinary work with the real max-attempt
-- bound. Do not delegate through a sentinel: exhausted rows outside the bounded
-- quarantine scan must remain ineligible for execution until a later pass can
-- quarantine them safely.
CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job_fenced(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;

 FOR v_candidate IN
  SELECT candidate.conversation_id,candidate.created_at,candidate.id
  FROM (
   SELECT DISTINCT ON (j.conversation_id) j.conversation_id,j.created_at,j.id
   FROM public.agent_inbound_jobs j
   WHERE j.status='pending' AND j.attempt_count>=p_max_attempts
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
   ORDER BY j.conversation_id,j.created_at,j.id
  ) candidate
  ORDER BY candidate.created_at,candidate.id
  LIMIT 64
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;
  UPDATE public.agent_inbound_jobs j
  SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='max safe attempts exceeded before runtime',updated_at=now()
  WHERE j.conversation_id=v_candidate.conversation_id AND j.status='pending'
    AND j.attempt_count>=p_max_attempts
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);
 END LOOP;

 FOR v_candidate IN
  SELECT candidate.id,candidate.conversation_id,candidate.created_at
  FROM (
   SELECT DISTINCT ON (j.conversation_id) j.id,j.conversation_id,j.created_at
   FROM public.agent_inbound_jobs j
   WHERE j.status='pending' AND j.attempt_count<p_max_attempts
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=j.conversation_id AND t.state IN ('retry_safe','processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active WHERE active.conversation_id=j.conversation_id AND active.id<>j.id AND active.status IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=j.conversation_id)
   ORDER BY j.conversation_id,j.created_at,j.id
  ) candidate
  ORDER BY candidate.created_at,candidate.id
  LIMIT 64
 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN CONTINUE; END IF;

  IF EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=v_candidate.conversation_id AND t.state IN ('retry_safe','processing_safe','processing'))
  OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs active WHERE active.conversation_id=v_candidate.conversation_id AND active.id<>v_candidate.id AND active.status IN ('processing_safe','processing'))
  OR EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_candidate.conversation_id)
  THEN CONTINUE; END IF;

  BEGIN
   RETURN QUERY UPDATE public.agent_inbound_jobs j
   SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
   WHERE j.id=v_candidate.id AND j.conversation_id=v_candidate.conversation_id
     AND j.status='pending' AND j.attempt_count<p_max_attempts
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
     AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=v_candidate.conversation_id AND t.state IN ('retry_safe','processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active WHERE active.conversation_id=v_candidate.conversation_id AND active.id<>j.id AND active.status IN ('processing_safe','processing'))
     AND NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=v_candidate.conversation_id)
   RETURNING j.*;
   IF FOUND THEN RETURN; END IF;
  EXCEPTION WHEN unique_violation THEN CONTINUE; END;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job_fenced(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job_fenced(text,integer) TO service_role;
