-- The background Stage B claimant previously bulk-quarantined exhausted pending
-- jobs before taking the per-conversation fence. That could race attachment or a
-- Customer Turn transition. Quarantine exhausted work conversation-by-conversation
-- under the same nonblocking seed-31 fence, then delegate ordinary claiming to the
-- existing fair claimant with a sentinel max-attempt value so its legacy bulk
-- exhaustion UPDATE is a no-op.
CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job_fenced(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_result public.agent_inbound_jobs%ROWTYPE;
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

 -- Existing claimant still owns fairness/generation-lock/active-turn selection.
 -- 2147483647 makes its pre-claim exhausted-row UPDATE unreachable for practical
 -- attempt counts while preserving its candidate path for every ordinary job.
 SELECT * INTO v_result FROM public.claim_next_agent_inbound_job(p_holder,2147483647) LIMIT 1;
 IF FOUND THEN RETURN NEXT v_result; END IF;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job_fenced(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job_fenced(text,integer) TO service_role;
