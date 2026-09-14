-- Prevent Stage B message-level ownership and Stage C Customer Turn ownership
-- from executing the same conversation at the same time during cutover/recovery.
CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(p_holder text,p_max_attempts integer DEFAULT 5)
RETURNS SETOF public.agent_inbound_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_max_attempts<1 THEN RAISE EXCEPTION 'p_max_attempts must be >= 1'; END IF;
 UPDATE public.agent_inbound_jobs j SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error='max safe attempts exceeded before runtime',updated_at=now()
 WHERE j.status='pending' AND j.attempt_count>=p_max_attempts
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id);
 BEGIN
  RETURN QUERY WITH candidate AS (
   SELECT j.id FROM public.agent_inbound_jobs j WHERE j.status='pending' AND j.attempt_count<p_max_attempts
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
   AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs active WHERE active.conversation_id=j.conversation_id AND active.id<>j.id AND active.status IN ('processing_safe','processing'))
   AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.conversation_id=j.conversation_id AND t.state='processing')
   ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE public.agent_inbound_jobs j SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),attempt_count=j.attempt_count+1,last_error=NULL,updated_at=now()
  FROM candidate c WHERE j.id=c.id RETURNING j.*;
 EXCEPTION WHEN unique_violation THEN RETURN; END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn(p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN QUERY WITH candidate AS (
 SELECT t.id FROM public.agent_customer_turns t WHERE t.state='collecting' AND t.last_received_at<=p_quiet_before
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.state='processing')
 AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN ('processing_safe','processing'))
 ORDER BY t.last_received_at,t.id FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE public.agent_customer_turns t SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
FROM candidate c WHERE t.id=c.id RETURNING t.*; END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(p_turn_id uuid,p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN QUERY WITH candidate AS (
 SELECT t.id FROM public.agent_customer_turns t WHERE t.id=p_turn_id AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.state='processing')
 AND NOT EXISTS(SELECT 1 FROM public.agent_inbound_jobs j WHERE j.conversation_id=t.conversation_id AND j.status IN ('processing_safe','processing'))
 FOR UPDATE SKIP LOCKED
) UPDATE public.agent_customer_turns t SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
FROM candidate c WHERE t.id=c.id RETURNING t.*; END $$;