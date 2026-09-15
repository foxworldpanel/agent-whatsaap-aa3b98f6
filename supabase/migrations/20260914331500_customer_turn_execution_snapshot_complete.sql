-- Complete the semantic execution snapshot. send_target and deferred_funnel were
-- still read from mutable Stage B jobs after attachment, allowing a sealed turn's
-- execution semantics to drift before a safe retry.
ALTER TABLE public.agent_customer_turn_messages
  ADD COLUMN IF NOT EXISTS send_target text,
  ADD COLUMN IF NOT EXISTS deferred_funnel boolean;

UPDATE public.agent_customer_turn_messages tm
SET send_target=j.send_target,
    deferred_funnel=j.deferred_funnel
FROM public.agent_inbound_jobs j
WHERE j.id=tm.job_id
  AND (tm.send_target IS NULL OR tm.deferred_funnel IS NULL);

CREATE OR REPLACE FUNCTION public.snapshot_agent_customer_turn_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.agent_inbound_jobs%ROWTYPE; v_message record;
BEGIN
 SELECT * INTO v_job FROM public.agent_inbound_jobs WHERE id=NEW.job_id;
 IF NOT FOUND OR v_job.message_id<>NEW.message_id THEN RAISE EXCEPTION 'Customer Turn member/job identity mismatch'; END IF;
 SELECT external_id,audio_url,conversation_id,workspace_id INTO v_message FROM public.messages WHERE id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member message missing'; END IF;
 IF v_message.conversation_id IS DISTINCT FROM v_job.conversation_id OR v_message.workspace_id IS DISTINCT FROM v_job.workspace_id THEN
   RAISE EXCEPTION 'Customer Turn member source identity mismatch';
 END IF;
 IF nullif(btrim(coalesce(v_message.external_id,'')),'') IS NULL THEN RAISE EXCEPTION 'Customer Turn member external identity missing'; END IF;
 IF nullif(btrim(coalesce(v_job.send_target,'')),'') IS NULL THEN RAISE EXCEPTION 'Customer Turn member send target missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turns t WHERE t.id=NEW.turn_id AND t.conversation_id=v_job.conversation_id AND t.workspace_id=v_job.workspace_id) THEN
   RAISE EXCEPTION 'Customer Turn member turn identity mismatch';
 END IF;
 NEW.external_id:=v_message.external_id;
 NEW.input_text:=v_job.input_text;
 NEW.input_kind:=v_job.input_kind;
 NEW.input_mime:=v_job.input_mime;
 NEW.audio_url:=v_message.audio_url;
 NEW.send_target:=v_job.send_target;
 NEW.deferred_funnel:=v_job.deferred_funnel;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_snapshot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.turn_id IS DISTINCT FROM OLD.turn_id OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.message_id IS DISTINCT FROM OLD.message_id
 OR NEW.ordinal IS DISTINCT FROM OLD.ordinal OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.input_text IS DISTINCT FROM OLD.input_text
 OR NEW.input_kind IS DISTINCT FROM OLD.input_kind OR NEW.input_mime IS DISTINCT FROM OLD.input_mime OR NEW.audio_url IS DISTINCT FROM OLD.audio_url
 OR NEW.send_target IS DISTINCT FROM OLD.send_target OR NEW.deferred_funnel IS DISTINCT FROM OLD.deferred_funnel OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Customer Turn member semantic snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members(p_turn_id uuid)
RETURNS TABLE(turn_id uuid,job_id uuid,message_id uuid,ordinal bigint,external_id text,input_text text,input_kind text,input_mime text,audio_url text,send_target text,deferred_funnel boolean,resolved_text text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tm.turn_id,tm.job_id,tm.message_id,tm.ordinal,tm.external_id,tm.input_text,tm.input_kind,tm.input_mime,tm.audio_url,tm.send_target,tm.deferred_funnel,tm.resolved_text,tm.created_at
 FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=p_turn_id ORDER BY tm.ordinal;
$$;
