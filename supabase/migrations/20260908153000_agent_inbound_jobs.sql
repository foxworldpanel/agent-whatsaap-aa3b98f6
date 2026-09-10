-- Stage B: durable ownership for eligible Agent V3 inbound messages.
-- Message-level coordination only; Customer Turn aggregation belongs to Stage C.
CREATE TABLE public.agent_inbound_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 send_target text NOT NULL,
 input_text text NOT NULL DEFAULT '',
 input_kind text NOT NULL DEFAULT 'texto' CHECK (input_kind IN ('texto','audio','image','sticker')),
 input_mime text,
 deferred_funnel boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing_safe','processing','processed','needs_review')),
 claimed_by text,
 claimed_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT agent_inbound_jobs_message_unique UNIQUE(message_id)
);
CREATE INDEX agent_inbound_jobs_pending_idx ON public.agent_inbound_jobs(created_at) WHERE status='pending';
CREATE INDEX agent_inbound_jobs_conversation_idx ON public.agent_inbound_jobs(conversation_id,status,created_at);
CREATE INDEX agent_inbound_jobs_processing_safe_idx ON public.agent_inbound_jobs(claimed_at) WHERE status='processing_safe';
CREATE INDEX agent_inbound_jobs_needs_review_idx ON public.agent_inbound_jobs(updated_at) WHERE status='needs_review';
ALTER TABLE public.agent_inbound_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_inbound_jobs FROM anon,authenticated,public;
GRANT ALL ON public.agent_inbound_jobs TO service_role;
CREATE POLICY "service role manages agent inbound jobs" ON public.agent_inbound_jobs FOR ALL TO service_role USING(true) WITH CHECK(true);
COMMENT ON TABLE public.agent_inbound_jobs IS 'Durable message-level ownership for eligible Agent V3 inbound processing. Stage B; not Customer Turn aggregation.';

CREATE OR REPLACE FUNCTION public.claim_agent_inbound_job(p_message_id uuid,p_holder text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE public.agent_inbound_jobs SET status='processing_safe',claimed_by=p_holder,claimed_at=now(),attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
 WHERE message_id=p_message_id AND status='pending' RETURNING id INTO v_id;
 RETURN v_id IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_agent_inbound_job(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_inbound_job(uuid,text) TO service_role;

-- Dispatcher claim: atomically owns the oldest pending job whose conversation
-- has no other active inbound job. SKIP LOCKED lets multiple dispatcher
-- instances cooperate without claiming the same row.
CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job(p_holder text)
RETURNS SETOF public.agent_inbound_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY
 WITH candidate AS (
  SELECT j.id
  FROM public.agent_inbound_jobs j
  WHERE j.status='pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.agent_inbound_jobs active
      WHERE active.conversation_id=j.conversation_id
        AND active.id<>j.id
        AND active.status IN ('processing_safe','processing')
    )
  ORDER BY j.created_at,j.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
 )
 UPDATE public.agent_inbound_jobs j
 SET status='processing_safe',
     claimed_by=p_holder,
     claimed_at=now(),
     attempt_count=j.attempt_count+1,
     last_error=NULL,
     updated_at=now()
 FROM candidate c
 WHERE j.id=c.id
 RETURNING j.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text) TO service_role;

-- Transfer a processing_safe dispatcher selection to its runtime holder without
-- returning the row to pending. This closes the release/reclaim race where a
-- second worker could steal the same message between queue selection and the
-- persistent conversation-lock acquisition.
CREATE OR REPLACE FUNCTION public.transfer_agent_inbound_job_claim(
 p_message_id uuid,
 p_from_holder text,
 p_to_holder text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE public.agent_inbound_jobs
 SET claimed_by=p_to_holder,
     claimed_at=now(),
     updated_at=now()
 WHERE message_id=p_message_id
   AND status='processing_safe'
   AND claimed_by=p_from_holder
 RETURNING id INTO v_id;
 RETURN v_id IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.transfer_agent_inbound_job_claim(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_agent_inbound_job_claim(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.enter_agent_inbound_runtime(p_message_id uuid,p_holder text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 UPDATE public.agent_inbound_jobs SET status='processing',updated_at=now()
 WHERE message_id=p_message_id AND status='processing_safe' AND claimed_by=p_holder RETURNING id INTO v_id;
 RETURN v_id IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.enter_agent_inbound_runtime(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enter_agent_inbound_runtime(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_agent_inbound_jobs(p_stale_before timestamptz,p_max_attempts integer DEFAULT 5)
RETURNS TABLE(requeued integer,review integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_requeued integer:=0; v_review integer:=0; v_unsafe_review integer:=0;
BEGIN
 IF p_max_attempts < 1 THEN
  RAISE EXCEPTION 'p_max_attempts must be >= 1';
 END IF;

 WITH changed AS (
  UPDATE public.agent_inbound_jobs
  SET status=CASE WHEN attempt_count>=p_max_attempts THEN 'needs_review' ELSE 'pending' END,
      claimed_by=NULL,claimed_at=NULL,
      last_error=CASE WHEN attempt_count>=p_max_attempts THEN 'stale processing_safe exceeded max attempts' ELSE 'recovered stale processing_safe claim' END,
      updated_at=now()
  WHERE status='processing_safe' AND claimed_at<p_stale_before
  RETURNING status
 )
 SELECT count(*) FILTER(WHERE status='pending')::integer,
        count(*) FILTER(WHERE status='needs_review')::integer
 INTO v_requeued,v_review FROM changed;

 WITH unsafe AS (
  UPDATE public.agent_inbound_jobs
  SET status='needs_review',claimed_by=NULL,claimed_at=NULL,
      last_error=COALESCE(last_error,'stale processing state; external side effect uncertain'),updated_at=now()
  WHERE status='processing' AND claimed_at<p_stale_before
  RETURNING 1
 )
 SELECT count(*)::integer INTO v_unsafe_review FROM unsafe;

 v_review := v_review + v_unsafe_review;
 RETURN QUERY SELECT v_requeued,v_review;
END; $$;
REVOKE ALL ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) TO service_role;