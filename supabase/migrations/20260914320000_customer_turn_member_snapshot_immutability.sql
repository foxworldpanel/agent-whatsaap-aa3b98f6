-- The membership snapshot is an execution identity boundary. The previous
-- attachment trigger populated it, but a later UPDATE could still rewrite those
-- fields. Reject semantic snapshot drift while leaving resolved_text writable as
-- the intentional durable media-resolution cache.

CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_snapshot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.turn_id IS DISTINCT FROM OLD.turn_id
 OR NEW.job_id IS DISTINCT FROM OLD.job_id
 OR NEW.message_id IS DISTINCT FROM OLD.message_id
 OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
 OR NEW.external_id IS DISTINCT FROM OLD.external_id
 OR NEW.input_text IS DISTINCT FROM OLD.input_text
 OR NEW.input_kind IS DISTINCT FROM OLD.input_kind
 OR NEW.input_mime IS DISTINCT FROM OLD.input_mime
 OR NEW.audio_url IS DISTINCT FROM OLD.audio_url
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Customer Turn member semantic snapshot is immutable';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_agent_customer_turn_member_snapshot_update ON public.agent_customer_turn_messages;
CREATE TRIGGER guard_agent_customer_turn_member_snapshot_update
BEFORE UPDATE ON public.agent_customer_turn_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_customer_turn_member_snapshot_update();

REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_snapshot_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_snapshot_update() TO service_role;
