-- Eliminate attach/claim deadlocks and the remaining quiet-window race by using
-- one lock order everywhere that crosses the Stage B / Customer Turn boundary:
-- conversation advisory key first, row locks second, then re-check predicates.
--
-- Do not take a job/turn row lock and then wait on the conversation advisory
-- lock: ingress may hold the advisory lock while waiting for that same row.

CREATE OR REPLACE FUNCTION public.attach_agent_inbound_job_to_customer_turn(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_job public.agent_inbound_jobs%ROWTYPE;
 v_conversation_id uuid;
 v_turn uuid;
BEGIN
 -- Read only the immutable routing key first. The durable job is locked only
 -- after the conversation fence is owned, matching every claim path below.
 SELECT conversation_id INTO v_conversation_id
 FROM public.agent_inbound_jobs
 WHERE id=p_job_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent inbound job not found'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 SELECT * INTO v_job
 FROM public.agent_inbound_jobs
 WHERE id=p_job_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent inbound job not found'; END IF;
 IF v_job.conversation_id<>v_conversation_id THEN
  RAISE EXCEPTION 'agent inbound job conversation changed during attachment';
 END IF;

 SELECT turn_id INTO v_turn
 FROM public.agent_customer_turn_messages
 WHERE job_id=p_job_id;
 IF FOUND THEN RETURN v_turn; END IF;

 IF v_job.status<>'pending' THEN
  RAISE EXCEPTION 'agent inbound job % is not pending',p_job_id;
 END IF;

 -- A processing turn cannot receive late arrivals. Once the advisory fence is
 -- held, any new message is attached to the existing collecting next turn or a
 -- new collecting turn, so arrivals racing the quiet-window claim cannot leak
 -- into the sealed turn.
 SELECT id INTO v_turn
 FROM public.agent_customer_turns
 WHERE conversation_id=v_job.conversation_id AND state='collecting'
 ORDER BY created_at DESC
 LIMIT 1
 FOR UPDATE;

 IF v_turn IS NULL THEN
  INSERT INTO public.agent_customer_turns(conversation_id,workspace_id)
  VALUES(v_job.conversation_id,v_job.workspace_id)
  RETURNING id INTO v_turn;
 ELSE
  UPDATE public.agent_customer_turns
  SET last_received_at=now(),updated_at=now()
  WHERE id=v_turn;
 END IF;

 INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)
 VALUES(v_turn,v_job.id,v_job.message_id);
 RETURN v_turn;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_candidate_id uuid;
 v_conversation_id uuid;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;

 UPDATE public.agent_inbound_jobs j
 SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
     last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE j.status='pending' AND j.attempt_count>=p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);

 -- Candidate discovery is intentionally non-locking. Locking the job before the
 -- conversation fence can deadlock with Customer Turn ingress.
 SELECT j.id,j.conversation_id INTO v_candidate_id,v_conversation_id
 FROM public.agent_inbound_jobs j
 WHERE j.status='pending' AND j.attempt_count<p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
 ORDER BY j.created_at,j.id
 LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 -- Re-check every ownership predicate after the common conversation fence.
 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.conversation_id=v_conversation_id AND t.state='processing'
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs active
   WHERE active.conversation_id=v_conversation_id
     AND active.id<>v_candidate_id
     AND active.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 BEGIN
  RETURN QUERY
  UPDATE public.agent_inbound_jobs j
  SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),
      attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
  WHERE j.id=v_candidate_id
    AND j.conversation_id=v_conversation_id
    AND j.status='pending'
    AND j.attempt_count<p_max_attempts
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
  RETURNING j.*;
 EXCEPTION WHEN unique_violation THEN RETURN; END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_candidate_id uuid;
 v_conversation_id uuid;
BEGIN
 -- Discover without a row lock; acquire the shared conversation fence first.
 SELECT t.id,t.conversation_id INTO v_candidate_id,v_conversation_id
 FROM public.agent_customer_turns t
 WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
 ORDER BY t.last_received_at,t.id
 LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id
     AND a.id<>v_candidate_id
     AND a.state='processing'
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 -- last_received_at is re-checked while holding the same fence used by attach.
 -- Therefore an arrival that won the fence first extends the quiet window; an
 -- arrival that loses the fence necessarily belongs to the next collecting turn.
 RETURN QUERY
 UPDATE public.agent_customer_turns t
 SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate_id
   AND t.conversation_id=v_conversation_id
   AND t.state='collecting'
   AND t.last_received_at<=p_quiet_before
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(p_turn_id uuid,p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id
 FROM public.agent_customer_turns
 WHERE id=p_turn_id;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id
     AND a.id<>p_turn_id
     AND a.state='processing'
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY
 UPDATE public.agent_customer_turns t
 SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=p_turn_id
   AND t.conversation_id=v_conversation_id
   AND t.state='collecting'
   AND t.last_received_at<=p_quiet_before
 RETURNING t.*;
END $$;

REVOKE ALL ON FUNCTION public.attach_agent_inbound_job_to_customer_turn(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_agent_inbound_job_to_customer_turn(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;