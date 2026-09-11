-- Stage C+D durable semantic Customer Turns. Deployment is a separate gate.
CREATE TABLE public.agent_customer_turns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'collecting' CHECK(state IN ('collecting','processing','processed','needs_review')),
 last_received_at timestamptz NOT NULL DEFAULT now(), sealed_at timestamptz, claimed_by text, claimed_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_customer_turns_collecting_uq ON public.agent_customer_turns(conversation_id) WHERE state='collecting';
CREATE UNIQUE INDEX agent_customer_turns_processing_uq ON public.agent_customer_turns(conversation_id) WHERE state='processing';
CREATE INDEX agent_customer_turns_ready_idx ON public.agent_customer_turns(last_received_at,id) WHERE state='collecting';
CREATE TABLE public.agent_customer_turn_messages (
 turn_id uuid NOT NULL REFERENCES public.agent_customer_turns(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.agent_inbound_jobs(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 ordinal bigint GENERATED ALWAYS AS IDENTITY, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(turn_id,job_id), UNIQUE(job_id), UNIQUE(message_id)
);
CREATE INDEX agent_customer_turn_messages_order_idx ON public.agent_customer_turn_messages(turn_id,ordinal);
ALTER TABLE public.agent_customer_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_customer_turn_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_customer_turns,public.agent_customer_turn_messages FROM anon,authenticated,public;
GRANT ALL ON public.agent_customer_turns,public.agent_customer_turn_messages TO service_role;
CREATE POLICY "service role manages customer turns" ON public.agent_customer_turns FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY "service role manages customer turn messages" ON public.agent_customer_turn_messages FOR ALL TO service_role USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION public.attach_agent_inbound_job_to_customer_turn(p_job_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.agent_inbound_jobs%ROWTYPE; v_turn uuid;
BEGIN
 SELECT * INTO v_job FROM public.agent_inbound_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent inbound job not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31));
 SELECT turn_id INTO v_turn FROM public.agent_customer_turn_messages WHERE job_id=p_job_id;
 IF FOUND THEN RETURN v_turn; END IF;
 IF v_job.status <> 'pending' THEN RAISE EXCEPTION 'agent inbound job % is not pending',p_job_id; END IF;
 SELECT id INTO v_turn FROM public.agent_customer_turns WHERE conversation_id=v_job.conversation_id AND state='collecting' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF v_turn IS NULL THEN INSERT INTO public.agent_customer_turns(conversation_id,workspace_id) VALUES(v_job.conversation_id,v_job.workspace_id) RETURNING id INTO v_turn;
 ELSE UPDATE public.agent_customer_turns SET last_received_at=now(),updated_at=now() WHERE id=v_turn; END IF;
 INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id) VALUES(v_turn,v_job.id,v_job.message_id);
 RETURN v_turn;
END $$;

CREATE OR REPLACE FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(p_limit integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job record; v_count integer:=0;
BEGIN
 FOR v_job IN SELECT j.id FROM public.agent_inbound_jobs j WHERE j.status='pending'
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)
 ORDER BY j.created_at,j.id LIMIT greatest(1,least(coalesce(p_limit,50),200))
 LOOP PERFORM public.attach_agent_inbound_job_to_customer_turn(v_job.id); v_count:=v_count+1; END LOOP;
 RETURN v_count;
END $$;

-- Fence the Stage B message-level fallback once a job belongs to a semantic turn.
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
 ORDER BY t.last_received_at,t.id FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE public.agent_customer_turns t SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
FROM candidate c WHERE t.id=c.id RETURNING t.*; END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn(p_turn_id uuid,p_holder text,p_quiet_before timestamptz)
RETURNS SETOF public.agent_customer_turns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN QUERY WITH candidate AS (
 SELECT t.id FROM public.agent_customer_turns t WHERE t.id=p_turn_id AND t.state='collecting' AND t.last_received_at<=p_quiet_before
 AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turns a WHERE a.conversation_id=t.conversation_id AND a.state='processing')
 FOR UPDATE SKIP LOCKED
) UPDATE public.agent_customer_turns t SET state='processing',sealed_at=now(),claimed_by=p_holder,claimed_at=now(),updated_at=now()
FROM candidate c WHERE t.id=c.id RETURNING t.*; END $$;

CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members(p_turn_id uuid)
RETURNS TABLE(turn_id uuid,job_id uuid,message_id uuid,ordinal bigint,external_id text,input_text text,input_kind text,input_mime text,audio_url text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tm.turn_id,j.id,j.message_id,tm.ordinal,m.external_id,j.input_text,j.input_kind,j.input_mime,m.audio_url,m.created_at
 FROM public.agent_customer_turn_messages tm JOIN public.agent_inbound_jobs j ON j.id=tm.job_id JOIN public.messages m ON m.id=tm.message_id
 WHERE tm.turn_id=p_turn_id ORDER BY tm.ordinal,m.created_at,m.id;
$$;

CREATE OR REPLACE FUNCTION public.finish_agent_customer_turn(p_turn_id uuid,p_holder text,p_ok boolean,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_changed integer; v_terminal text;
BEGIN v_terminal:=CASE WHEN p_ok THEN 'processed' ELSE 'needs_review' END;
 UPDATE public.agent_customer_turns SET state=v_terminal,claimed_by=NULL,claimed_at=NULL,last_error=CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error,'unknown customer turn failure'),1000) END,updated_at=now() WHERE id=p_turn_id AND state='processing' AND claimed_by=p_holder;
 GET DIAGNOSTICS v_changed=ROW_COUNT; IF v_changed<>1 THEN RETURN false; END IF;
 UPDATE public.agent_inbound_jobs j SET status=v_terminal,claimed_by=NULL,claimed_at=NULL,last_error=CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error,'customer turn needs review'),1000) END,updated_at=now() FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=p_turn_id AND tm.job_id=j.id AND j.status='pending'; RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.recover_stale_agent_customer_turns(p_stale_before timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ids uuid[]; v_count integer:=0;
BEGIN
 WITH recovered AS (
  UPDATE public.agent_customer_turns SET state='needs_review',claimed_by=NULL,claimed_at=NULL,last_error='stale processing turn quarantined; runtime side effects may be uncertain',updated_at=now()
  WHERE state='processing' AND claimed_at<p_stale_before RETURNING id
 ) SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO v_ids FROM recovered;
 v_count:=cardinality(v_ids); IF v_count=0 THEN RETURN 0; END IF;
 UPDATE public.agent_inbound_jobs j SET status='needs_review',claimed_by=NULL,claimed_at=NULL,last_error='customer turn stale after runtime boundary',updated_at=now()
 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=ANY(v_ids) AND tm.job_id=j.id AND j.status='pending';
 RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.attach_agent_inbound_job_to_customer_turn(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.load_agent_customer_turn_members(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_agent_customer_turn(uuid,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_agent_inbound_job_to_customer_turn(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_pending_agent_inbound_jobs_to_customer_turns(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_agent_customer_turn(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_agent_customer_turn_members(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_agent_customer_turn(uuid,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_agent_customer_turns(timestamptz) TO service_role;
COMMENT ON TABLE public.agent_customer_turns IS 'Durable semantic Customer Turns; arrivals during processing form the next collecting turn.';