-- Complete the processing_safe rollout across every cross-runtime fence.
-- A sealed Customer Turn in processing_safe already owns its conversation even
-- though Agent V3 side effects have not started yet. Stage B fallback/recovery
-- must therefore treat processing_safe exactly like processing for exclusivity.

CREATE OR REPLACE FUNCTION public.claim_agent_inbound_job(
 p_message_id uuid,p_holder text,p_max_attempts integer DEFAULT 5
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_conversation_id uuid;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;
 SELECT conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turn_messages tm
   JOIN public.agent_inbound_jobs attached ON attached.id=tm.job_id
   WHERE attached.message_id=p_message_id
 ) OR EXISTS(
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.conversation_id=v_conversation_id AND t.state IN ('processing_safe','processing')
 ) THEN RETURN false; END IF;

 UPDATE public.agent_inbound_jobs j
 SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
     last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE j.message_id=p_message_id AND j.conversation_id=v_conversation_id
   AND j.status='pending' AND j.attempt_count>=p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);

 BEGIN
  UPDATE public.agent_inbound_jobs j
  SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),
      attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
  WHERE j.message_id=p_message_id AND j.conversation_id=v_conversation_id
    AND j.status='pending' AND j.attempt_count<p_max_attempts
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active
      WHERE active.conversation_id=v_conversation_id AND active.id<>j.id
        AND active.status IN ('processing_safe','processing')
    )
  RETURNING j.id INTO v_id;
 EXCEPTION WHEN unique_violation THEN v_id:=NULL; END;
 RETURN v_id IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;
 UPDATE public.agent_inbound_jobs j
 SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
     last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE j.status='pending' AND j.attempt_count>=p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);

 SELECT j.id,j.conversation_id INTO v_candidate_id,v_conversation_id
 FROM public.agent_inbound_jobs j
 WHERE j.status='pending' AND j.attempt_count<p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
 ORDER BY j.created_at,j.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.conversation_id=v_conversation_id AND t.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs active
   WHERE active.conversation_id=v_conversation_id AND active.id<>v_candidate_id
     AND active.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 BEGIN
  RETURN QUERY UPDATE public.agent_inbound_jobs j
  SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),
      attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
  WHERE j.id=v_candidate_id AND j.conversation_id=v_conversation_id
    AND j.status='pending' AND j.attempt_count<p_max_attempts
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
  RETURNING j.*;
 EXCEPTION WHEN unique_violation THEN RETURN; END;
END $$;

-- Recover each stale Customer Turn under the same advisory-first conversation
-- fence as ingress and claims. This prevents processing_safe -> collecting from
-- racing a new arrival that is creating the next collecting turn.
CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_candidate record;
 v_count integer:=0;
 v_changed integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT id,conversation_id
  FROM public.agent_customer_turns
  WHERE state IN ('processing_safe','processing') AND claimed_at<p_stale_before
  ORDER BY conversation_id,id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));

  -- If this is still pre-runtime, reopen only when no next collecting turn was
  -- already created. If one exists, merge the stale turn's members into that
  -- next turn before retiring the stale shell, preserving exactly-once member
  -- ownership and chronological processing without violating the collecting UQ.
  IF EXISTS(
    SELECT 1 FROM public.agent_customer_turns t
    WHERE t.id=v_candidate.id AND t.state='processing_safe' AND t.claimed_at<p_stale_before
  ) THEN
   DECLARE v_next_turn uuid;
   BEGIN
    SELECT id INTO v_next_turn
    FROM public.agent_customer_turns
    WHERE conversation_id=v_candidate.conversation_id AND state='collecting'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    IF v_next_turn IS NULL THEN
     UPDATE public.agent_customer_turns
     SET state='collecting',sealed_at=NULL,claimed_by=NULL,claimed_at=NULL,
         last_error='recovered stale pre-runtime customer turn claim',updated_at=now()
     WHERE id=v_candidate.id AND state='processing_safe' AND claimed_at<p_stale_before;
     GET DIAGNOSTICS v_changed=ROW_COUNT;
     v_count:=v_count+v_changed;
    ELSE
     -- The older sealed turn must execute before the newer collecting turn. Do
     -- not merge in reverse order. Quarantine the stale shell for review rather
     -- than silently reorder customer semantics.
     UPDATE public.agent_customer_turns
     SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
         last_error='stale pre-runtime turn has a newer collecting successor; manual ordering review required',updated_at=now()
     WHERE id=v_candidate.id AND state='processing_safe' AND claimed_at<p_stale_before;
     GET DIAGNOSTICS v_changed=ROW_COUNT;
     IF v_changed=1 THEN
      UPDATE public.agent_inbound_jobs j
      SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
          last_error='customer turn ordering uncertain after stale pre-runtime claim',updated_at=now()
      FROM public.agent_customer_turn_messages tm
      WHERE tm.turn_id=v_candidate.id AND tm.job_id=j.id AND j.status='pending';
     END IF;
     v_count:=v_count+v_changed;
    END IF;
   END;
  ELSE
   UPDATE public.agent_customer_turns
   SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
       last_error='stale processing turn quarantined; runtime side effects may be uncertain',updated_at=now()
   WHERE id=v_candidate.id AND state='processing' AND claimed_at<p_stale_before;
   GET DIAGNOSTICS v_changed=ROW_COUNT;
   IF v_changed=1 THEN
    UPDATE public.agent_inbound_jobs j
    SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
        last_error='customer turn stale after runtime boundary',updated_at=now()
    FROM public.agent_customer_turn_messages tm
    WHERE tm.turn_id=v_candidate.id AND tm.job_id=j.id AND j.status='pending';
   END IF;
   v_count:=v_count+v_changed;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
