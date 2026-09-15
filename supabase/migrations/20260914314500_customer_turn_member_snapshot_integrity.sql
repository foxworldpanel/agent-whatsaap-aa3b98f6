-- Customer Turn membership is the durable semantic snapshot. Once attached, the
-- member's execution identity must not drift if mutable CRM rows are later edited.
-- Persist the inbound job snapshot directly on membership and expose it to runtime.

ALTER TABLE public.agent_customer_turn_messages
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS input_text text,
  ADD COLUMN IF NOT EXISTS input_kind text,
  ADD COLUMN IF NOT EXISTS input_mime text,
  ADD COLUMN IF NOT EXISTS audio_url text;

-- Backfill already-attached rows before making new attachments snapshot eagerly.
UPDATE public.agent_customer_turn_messages tm
SET external_id=m.external_id,
    input_text=j.input_text,
    input_kind=j.input_kind,
    input_mime=j.input_mime,
    audio_url=m.audio_url
FROM public.agent_inbound_jobs j
JOIN public.messages m ON m.id=j.message_id
WHERE tm.job_id=j.id
  AND (tm.external_id IS NULL OR tm.input_text IS NULL OR tm.input_kind IS NULL);

CREATE OR REPLACE FUNCTION public.snapshot_agent_customer_turn_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_job public.agent_inbound_jobs%ROWTYPE; v_message record;
BEGIN
 SELECT * INTO v_job FROM public.agent_inbound_jobs WHERE id=NEW.job_id;
 IF NOT FOUND OR v_job.message_id<>NEW.message_id THEN
   RAISE EXCEPTION 'Customer Turn member/job identity mismatch';
 END IF;
 SELECT external_id,audio_url INTO v_message FROM public.messages WHERE id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member message missing'; END IF;
 NEW.external_id:=v_message.external_id;
 NEW.input_text:=v_job.input_text;
 NEW.input_kind:=v_job.input_kind;
 NEW.input_mime:=v_job.input_mime;
 NEW.audio_url:=v_message.audio_url;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS snapshot_agent_customer_turn_member ON public.agent_customer_turn_messages;
CREATE TRIGGER snapshot_agent_customer_turn_member
BEFORE INSERT ON public.agent_customer_turn_messages
FOR EACH ROW EXECUTE FUNCTION public.snapshot_agent_customer_turn_member();

CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members(p_turn_id uuid)
RETURNS TABLE(turn_id uuid,job_id uuid,message_id uuid,ordinal bigint,external_id text,input_text text,input_kind text,input_mime text,audio_url text,resolved_text text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT tm.turn_id,tm.job_id,tm.message_id,tm.ordinal,tm.external_id,tm.input_text,tm.input_kind,tm.input_mime,tm.audio_url,tm.resolved_text,tm.created_at
 FROM public.agent_customer_turn_messages tm
 WHERE tm.turn_id=p_turn_id
 ORDER BY tm.ordinal;
$$;

REVOKE ALL ON FUNCTION public.snapshot_agent_customer_turn_member() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.load_agent_customer_turn_members(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_agent_customer_turn_member() TO service_role;
GRANT EXECUTE ON FUNCTION public.load_agent_customer_turn_members(uuid) TO service_role;
