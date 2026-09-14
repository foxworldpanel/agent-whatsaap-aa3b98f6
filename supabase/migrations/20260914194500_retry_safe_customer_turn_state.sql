-- Preserve automatic recovery and strict ordering when a pre-runtime claim dies
-- after a newer message has already created the next collecting Customer Turn.
--
-- retry_safe is sealed semantic work whose runtime never started. It is not open
-- to new arrivals, but it is eligible for a fresh claim ahead of newer collecting
-- work. This avoids either merging distinct turns or quarantining safe work.

ALTER TABLE public.agent_customer_turns
 DROP CONSTRAINT IF EXISTS agent_customer_turns_state_check;
ALTER TABLE public.agent_customer_turns
 ADD CONSTRAINT agent_customer_turns_state_check
 CHECK(state IN ('collecting','retry_safe','processing_safe','processing','processed','needs_review'));

CREATE INDEX IF NOT EXISTS agent_customer_turns_retry_safe_idx
 ON public.agent_customer_turns(created_at,id) WHERE state='retry_safe';

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid; v_candidate_state text;
BEGIN
 -- retry_safe is older sealed work and therefore outranks a newer collecting
 -- successor in the same conversation. Across conversations use creation/quiet
 -- chronology as the stable scheduling key.
 SELECT q.id,q.conversation_id,q.state INTO v_candidate_id,v_conversation_id,v_candidate_state
 FROM (
  SELECT t.id,t.conversation_id,t.state,t.created_at AS ready_at
  FROM public.agent_customer_turns t WHERE t.state='retry_safe'
  UNION ALL
  SELECT t.id,t.conversation_id,t.state,t.last_received_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe'
    )
 ) q
 ORDER BY q.ready_at,q.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>v_candidate_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),
     claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate_id AND t.conversation_id=v_conversation_id
   AND (
    t.state='retry_safe'
    OR (t.state='collecting' AND t.last_received_at<=p_quiet_before
        AND NOT EXISTS(
          SELECT 1 FROM public.agent_customer_turns older
          WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
        ))
   )
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(p_turn_id uuid,p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;
BEGIN
 SELECT conversation_id INTO v_conversation_id FROM public.agent_customer_turns WHERE id=p_turn_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>p_turn_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),
     claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=p_turn_id AND t.conversation_id=v_conversation_id
   AND (
    t.state='retry_safe'
    OR (t.state='collecting' AND t.last_received_at<=p_quiet_before
        AND NOT EXISTS(
          SELECT 1 FROM public.agent_customer_turns older
          WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
        ))
   )
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_changed integer:=0; v_count integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT id,conversation_id
  FROM public.agent_customer_turns
  WHERE state IN ('processing_safe','processing') AND claimed_at<p_stale_before
  ORDER BY conversation_id,id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));

  -- Safe pre-runtime work becomes sealed retry work. It stays separate from any
  -- newer collecting successor and will be selected first by the dispatcher.
  UPDATE public.agent_customer_turns
  SET state='retry_safe',claimed_by=NULL,claimed_at=NULL,
      last_error='recovered stale pre-runtime customer turn claim',updated_at=now()
  WHERE id=v_candidate.id AND state='processing_safe' AND claimed_at<p_stale_before;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed=1 THEN v_count:=v_count+1; CONTINUE; END IF;

  -- Runtime-started work is never replayed automatically.
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
   v_count:=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
