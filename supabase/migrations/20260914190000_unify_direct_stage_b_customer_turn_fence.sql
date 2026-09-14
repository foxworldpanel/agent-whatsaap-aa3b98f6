-- Close the remaining cross-runtime hole: direct Stage B claims must use the
-- same conversation advisory fence as Customer Turn attach/claim operations.
--
-- Stage B originally used advisory seed 0. Stage C introduced seed 31 for the
-- semantic-turn boundary. Leaving claim_agent_inbound_job on seed 0 would allow
-- a legacy/direct caller to claim a pending job concurrently with a Customer
-- Turn claim for the same conversation.

CREATE OR REPLACE FUNCTION public.claim_agent_inbound_job(
 p_message_id uuid,
 p_holder text,
 p_max_attempts integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_id uuid;
 v_conversation_id uuid;
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;

 -- Routing-key discovery is intentionally non-locking. The conversation fence
 -- is always acquired before any row mutation, matching Customer Turn ingress.
 SELECT conversation_id INTO v_conversation_id
 FROM public.agent_inbound_jobs
 WHERE message_id=p_message_id;
 IF NOT FOUND THEN RETURN false; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 -- A job already attached to a semantic turn is owned exclusively by Stage C/D.
 -- A processing semantic turn also blocks any unattached Stage B fallback in
 -- this conversation, preventing two logical runtimes from executing together.
 IF EXISTS(
   SELECT 1
   FROM public.agent_customer_turn_messages tm
   JOIN public.agent_inbound_jobs attached ON attached.id=tm.job_id
   WHERE attached.message_id=p_message_id
 ) OR EXISTS(
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.conversation_id=v_conversation_id AND t.state='processing'
 ) THEN
  RETURN false;
 END IF;

 UPDATE public.agent_inbound_jobs
 SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
     last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE message_id=p_message_id
   AND conversation_id=v_conversation_id
   AND status='pending'
   AND attempt_count>=p_max_attempts
   AND NOT EXISTS(
     SELECT 1 FROM public.agent_customer_turn_messages tm
     WHERE tm.job_id=agent_inbound_jobs.id
   );

 BEGIN
  UPDATE public.agent_inbound_jobs
  SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),
      attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
  WHERE message_id=p_message_id
    AND conversation_id=v_conversation_id
    AND status='pending'
    AND attempt_count<p_max_attempts
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_customer_turn_messages tm
      WHERE tm.job_id=agent_inbound_jobs.id
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.agent_inbound_jobs active
      WHERE active.conversation_id=v_conversation_id
        AND active.id<>agent_inbound_jobs.id
        AND active.status IN ('processing_safe','processing')
    )
  RETURNING id INTO v_id;
 EXCEPTION WHEN unique_violation THEN
  v_id:=NULL;
 END;

 RETURN v_id IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_inbound_job(uuid,text,integer) TO service_role;
