-- Harden snapshot creation itself: the CRM message used to populate external/media
-- identity must belong to the same durable conversation/workspace as the job.
-- This prevents a corrupted cross-tenant message reference from becoming a valid
-- Customer Turn membership snapshot.

CREATE OR REPLACE FUNCTION public.snapshot_agent_customer_turn_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.agent_inbound_jobs%ROWTYPE; v_message record;
BEGIN
 SELECT * INTO v_job FROM public.agent_inbound_jobs WHERE id=NEW.job_id;
 IF NOT FOUND OR v_job.message_id<>NEW.message_id THEN
   RAISE EXCEPTION 'Customer Turn member/job identity mismatch';
 END IF;

 SELECT external_id,audio_url,conversation_id,workspace_id
 INTO v_message
 FROM public.messages
 WHERE id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member message missing'; END IF;
 IF v_message.conversation_id IS DISTINCT FROM v_job.conversation_id
 OR v_message.workspace_id IS DISTINCT FROM v_job.workspace_id THEN
   RAISE EXCEPTION 'Customer Turn member source identity mismatch';
 END IF;
 IF nullif(btrim(coalesce(v_message.external_id,'')),'') IS NULL THEN
   RAISE EXCEPTION 'Customer Turn member external identity missing';
 END IF;

 -- The turn itself is also part of the identity boundary.
 IF NOT EXISTS(
   SELECT 1 FROM public.agent_customer_turns t
   WHERE t.id=NEW.turn_id
     AND t.conversation_id=v_job.conversation_id
     AND t.workspace_id=v_job.workspace_id
 ) THEN
   RAISE EXCEPTION 'Customer Turn member turn identity mismatch';
 END IF;

 NEW.external_id:=v_message.external_id;
 NEW.input_text:=v_job.input_text;
 NEW.input_kind:=v_job.input_kind;
 NEW.input_mime:=v_job.input_mime;
 NEW.audio_url:=v_message.audio_url;
 RETURN NEW;
END $$;
