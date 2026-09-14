-- retry_safe is still semantic Customer Turn ownership. Legacy Stage B fallback
-- must not overtake it with a newer unattached message from the same conversation.

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
   WHERE t.conversation_id=v_conversation_id
     AND t.state IN ('retry_safe','processing_safe','processing')
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
   WHERE t.conversation_id=v_conversation_id
     AND t.state IN ('retry_safe','processing_safe','processing')
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

REVOKE ALL ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer) TO service_role;
