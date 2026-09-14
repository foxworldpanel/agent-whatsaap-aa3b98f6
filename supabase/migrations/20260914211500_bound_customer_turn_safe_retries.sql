-- Bound crash-only retries before the Agent V3 side-effect boundary. Normal
-- deterministic preparation failures are terminalized by the application; this
-- counter protects against repeated process death/OOM while processing_safe.
ALTER TABLE public.agent_customer_turns
 ADD COLUMN IF NOT EXISTS safe_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.agent_customer_turns
 DROP CONSTRAINT IF EXISTS agent_customer_turns_safe_attempt_count_check;
ALTER TABLE public.agent_customer_turns
 ADD CONSTRAINT agent_customer_turns_safe_attempt_count_check CHECK (safe_attempt_count>=0);

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(
 p_holder text,p_quiet_before timestamptz
)
RETURNS SETOF public.agent_customer_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate_id uuid; v_conversation_id uuid;
BEGIN
 SELECT q.id,q.conversation_id INTO v_candidate_id,v_conversation_id
 FROM (
  SELECT t.id,t.conversation_id,t.created_at AS ready_at
  FROM public.agent_customer_turns t
  WHERE t.state='retry_safe' AND t.safe_attempt_count<5
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turns older
      WHERE older.conversation_id=t.conversation_id AND older.state='retry_safe'
        AND (older.created_at,older.id)<(t.created_at,t.id)
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
 ) q ORDER BY q.ready_at,q.id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=v_conversation_id AND a.id<>v_candidate_id AND a.state IN ('processing_safe','processing'))
 OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=v_conversation_id AND j.status IN ('processing_safe','processing'))
 THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
     claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
 WHERE t.id=v_candidate_id AND t.conversation_id=v_conversation_id AND t.safe_attempt_count<5
 AND ((t.state='retry_safe' AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id
   AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)
 )) OR (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
 ))) RETURNING t.*;
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
 THEN RETURN; END IF;

 RETURN QUERY UPDATE public.agent_customer_turns t
 SET state='processing_safe',sealed_at=coalesce(t.sealed_at,now()),claimed_by=p_holder,
     claimed_at=now(),safe_attempt_count=t.safe_attempt_count+1,updated_at=now()
 WHERE t.id=p_turn_id AND t.conversation_id=v_conversation_id AND t.safe_attempt_count<5
 AND ((t.state='retry_safe' AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id
   AND older.state='retry_safe' AND (older.created_at,older.id)<(t.created_at,t.id)
 )) OR (t.state='collecting' AND t.last_received_at<=p_quiet_before AND NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns older WHERE older.conversation_id=v_conversation_id AND older.state='retry_safe'
 ))) RETURNING t.*;
END $$;

CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_candidate record; v_count integer:=0; v_changed integer:=0;
BEGIN
 FOR v_candidate IN
  SELECT id,conversation_id FROM public.agent_customer_turns
  WHERE state IN ('processing_safe','processing') AND claimed_at<p_stale_before
  ORDER BY conversation_id,created_at,id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31));

  UPDATE public.agent_customer_turns
  SET state=CASE WHEN state='processing_safe' AND safe_attempt_count<5 THEN 'retry_safe' ELSE 'needs_review' END,
      claimed_by=NULL,claimed_at=NULL,
      last_error=CASE
       WHEN state='processing_safe' AND safe_attempt_count<5 THEN 'recovered stale pre-runtime customer turn claim; safe retry allowed'
       WHEN state='processing_safe' THEN 'max safe pre-runtime customer turn attempts exceeded'
       ELSE 'stale processing turn quarantined; runtime side effects may be uncertain'
      END,updated_at=now()
  WHERE id=v_candidate.id AND state IN ('processing_safe','processing') AND claimed_at<p_stale_before;
  GET DIAGNOSTICS v_changed=ROW_COUNT;

  IF v_changed=1 AND EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.id=v_candidate.id AND t.state='needs_review') THEN
   UPDATE public.agent_inbound_jobs j
   SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
       last_error='customer turn quarantined after stale claim',updated_at=now()
   FROM public.agent_customer_turn_messages tm
   WHERE tm.turn_id=v_candidate.id AND tm.job_id=j.id AND j.status='pending';
  END IF;
  v_count:=v_count+v_changed;
 END LOOP;
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
