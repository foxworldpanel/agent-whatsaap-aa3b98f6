-- Customer Turn crash recovery with an explicit pre-runtime boundary.
--
-- Previously a claimed Customer Turn immediately entered state=processing. A
-- process crash while merely loading/validating its members was therefore
-- indistinguishable from a crash after Agent V3 external side effects began,
-- forcing harmless pre-runtime crashes into needs_review.
--
-- processing_safe means the turn is sealed/owned but runtime side effects have
-- NOT started. processing means the runtime boundary has been crossed.

ALTER TABLE public.agent_customer_turns
 DROP CONSTRAINT IF EXISTS agent_customer_turns_state_check;

ALTER TABLE public.agent_customer_turns
 ADD CONSTRAINT agent_customer_turns_state_check
 CHECK(state IN ('collecting','processing_safe','processing','processed','needs_review'));

DROP INDEX IF EXISTS public.agent_customer_turns_processing_uq;
CREATE UNIQUE INDEX agent_customer_turns_processing_uq
 ON public.agent_customer_turns(conversation_id)
 WHERE state IN ('processing_safe','processing');

CREATE OR REPLACE FUNCTION public.enter_agent_customer_turn_runtime(
 p_turn_id uuid,
 p_holder text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_changed integer;
BEGIN
 UPDATE public.agent_customer_turns
 SET state='processing',updated_at=now()
 WHERE id=p_turn_id AND state='processing_safe' AND claimed_by=p_holder;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN v_changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid;
BEGIN
 SELECT t.id,t.conversation_id INTO v_candidate_id,v_conversation_id
 FROM public.agent_customer_turns t
 WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
 ORDER BY t.last_received_at,t.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 IF EXISTS(
   SELECT 1 FROM public.agent_customer_turns a
   WHERE a.conversation_id=v_conversation_id AND a.id<>v_candidate_id
     AND a.state IN ('processing_safe','processing')
 ) OR EXISTS(
   SELECT 1 FROM public.agent_inbound_jobs j
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY
 UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=v_candidate_id AND t.conversation_id=v_conversation_id
   AND t.state='collecting' AND t.last_received_at<=p_quiet_before
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
   WHERE j.conversation_id=v_conversation_id
     AND j.status IN ('processing_safe','processing')
 ) THEN RETURN; END IF;

 RETURN QUERY
 UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
 WHERE t.id=p_turn_id AND t.conversation_id=v_conversation_id
   AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.finish_agent_customer_turn(
 p_turn_id uuid,p_holder text,p_ok boolean,p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_changed integer; v_terminal text;
BEGIN
 v_terminal:=CASE WHEN p_ok THEN 'processed' ELSE 'needs_review' END;
 UPDATE public.agent_customer_turns
 SET state=v_terminal,claimed_by=NULL,claimed_at=NULL,
     last_error=CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error,'unknown customer turn failure'),1000) END,
     updated_at=now()
 WHERE id=p_turn_id AND state IN ('processing_safe','processing') AND claimed_by=p_holder;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>1 THEN RETURN false; END IF;
 UPDATE public.agent_inbound_jobs j
 SET status=v_terminal,claimed_by=NULL,claimed_at=NULL,
     last_error=CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error,'customer turn needs review'),1000) END,
     updated_at=now()
 FROM public.agent_customer_turn_messages tm
 WHERE tm.turn_id=p_turn_id AND tm.job_id=j.id AND j.status='pending';
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_safe_count integer:=0; v_unsafe_ids uuid[]; v_unsafe_count integer:=0;
BEGIN
 -- Safe claim: runtime boundary was never crossed. Re-open the same sealed turn
 -- for a later dispatcher. Members remain attached exactly once.
 WITH safe AS (
  UPDATE public.agent_customer_turns
  SET state='collecting',sealed_at=NULL,claimed_by=NULL,claimed_at=NULL,
      last_error='recovered stale pre-runtime customer turn claim',updated_at=now()
  WHERE state='processing_safe' AND claimed_at<p_stale_before
  RETURNING 1
 ) SELECT count(*)::integer INTO v_safe_count FROM safe;

 -- Unsafe claim: Agent V3 may already have emitted an external side effect.
 WITH unsafe AS (
  UPDATE public.agent_customer_turns
  SET state='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='stale processing turn quarantined; runtime side effects may be uncertain',updated_at=now()
  WHERE state='processing' AND claimed_at<p_stale_before
  RETURNING id
 ) SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO v_unsafe_ids FROM unsafe;

 v_unsafe_count:=cardinality(v_unsafe_ids);
 IF v_unsafe_count>0 THEN
  UPDATE public.agent_inbound_jobs j
  SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='customer turn stale after runtime boundary',updated_at=now()
  FROM public.agent_customer_turn_messages tm
  WHERE tm.turn_id=ANY(v_unsafe_ids) AND tm.job_id=j.id AND j.status='pending';
 END IF;
 RETURN v_safe_count+v_unsafe_count;
END $$;

REVOKE ALL ON FUNCTION public.enter_agent_customer_turn_runtime(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_agent_customer_turn(uuid,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enter_agent_customer_turn_runtime(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_agent_customer_turn(uuid,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
