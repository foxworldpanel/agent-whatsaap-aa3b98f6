-- Building a Customer Turn runtime input can fail on transient provider/media/DB
-- reads before Agent V3 side effects begin. Do not quarantine that safe work on the
-- first failure. Return the sealed turn to retry_safe while its bounded safe-attempt
-- budget remains; quarantine only after the fifth safe claim.

CREATE OR REPLACE FUNCTION public.release_agent_customer_turn_safe(
 p_turn_id uuid,
 p_holder text,
 p_error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_conversation_id uuid;
 v_attempts integer;
 v_next_state text;
BEGIN
 SELECT conversation_id,safe_attempt_count
 INTO v_conversation_id,v_attempts
 FROM public.agent_customer_turns
 WHERE id=p_turn_id AND state='processing_safe' AND claimed_by=p_holder;
 IF NOT FOUND THEN RETURN NULL; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 -- Revalidate exact safe ownership after entering the shared conversation fence.
 SELECT safe_attempt_count INTO v_attempts
 FROM public.agent_customer_turns
 WHERE id=p_turn_id AND conversation_id=v_conversation_id
   AND state='processing_safe' AND claimed_by=p_holder
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;

 v_next_state:=CASE WHEN v_attempts>=5 THEN 'needs_review' ELSE 'retry_safe' END;
 UPDATE public.agent_customer_turns
 SET state=v_next_state,claimed_by=NULL,claimed_at=NULL,
     last_error=left(coalesce(p_error,'pre-runtime customer turn failure'),1000),updated_at=now()
 WHERE id=p_turn_id AND conversation_id=v_conversation_id
   AND state='processing_safe' AND claimed_by=p_holder;
 IF NOT FOUND THEN RETURN NULL; END IF;

 IF v_next_state='needs_review' THEN
  UPDATE public.agent_inbound_jobs j
  SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error='customer turn exhausted safe pre-runtime retries',updated_at=now()
  FROM public.agent_customer_turn_messages tm
  WHERE tm.turn_id=p_turn_id AND tm.job_id=j.id AND j.status='pending';
 END IF;
 RETURN v_next_state;
END $$;

REVOKE ALL ON FUNCTION public.release_agent_customer_turn_safe(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_agent_customer_turn_safe(uuid,text,text) TO service_role;
