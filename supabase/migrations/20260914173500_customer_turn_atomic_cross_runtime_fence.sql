-- Close the remaining check-then-claim race between the Stage B message runtime
-- and Stage C Customer Turn runtime. Both ownership paths serialize on the same
-- transaction-scoped advisory key for the conversation, then re-check the
-- opposite runtime while holding that key.

CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate public.agent_inbound_jobs%ROWTYPE;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;
 UPDATE public.agent_inbound_jobs j SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE j.status='pending' AND j.attempt_count>=p_max_attempts
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);

 SELECT j.* INTO v_candidate FROM public.agent_inbound_jobs j
 WHERE j.status='pending' AND j.attempt_count<p_max_attempts
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
 ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));
 IF EXISTS(SELECT 1 FROM public.agent_inbound_jobs active WHERE active.conversation_id=v_candidate.conversation_id AND active.id<>v_candidate.id AND active.status IN ('processing_safe','processing'))
 OR EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=v_candidate.conversation_id AND t.state='processing') THEN
  RETURN;
 END IF;

 BEGIN
  RETURN QUERY UPDATE public.agent_inbound_jobs j
  SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
  WHERE j.id=v_candidate.id AND j.status='pending' AND j.attempt_count<p_max_attempts
  AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
  RETURNING j.*;
 EXCEPTION WHEN unique_violation THEN RETURN; END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate public.agent_customer_turns%ROWTYPE;
BEGIN
 SELECT t.* INTO v_candidate FROM public.agent_customer_turns t
 WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
 ORDER BY t.last_received_at,t.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id AND a.state='processing')
 OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_candidate.conversation_id AND j.status IN ('processing_safe','processing')) THEN
  RETURN;
 END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate.id AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(p_turn_id uuid,p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate public.agent_customer_turns%ROWTYPE;
BEGIN
 SELECT t.* INTO v_candidate FROM public.agent_customer_turns t
 WHERE t.id=p_turn_id AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_candidate.conversation_id AND a.id<>v_candidate.id AND a.state='processing')
 OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_candidate.conversation_id AND j.status IN ('processing_safe','processing')) THEN
  RETURN;
 END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate.id AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 RETURNING t.*;
END $$;