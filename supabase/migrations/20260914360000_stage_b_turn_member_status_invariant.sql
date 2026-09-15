-- A Stage B job attached to a semantic Customer Turn must remain pending until
-- the Customer Turn owner moves the whole turn through processing_safe/runtime.
-- Enforce this at attachment time so direct Stage B ownership cannot leak into
-- Stage C even if a future caller bypasses the current claim barriers.
CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_pending_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_claimed_by text; v_conversation_id uuid;
BEGIN
 SELECT status,claimed_by,conversation_id INTO v_status,v_claimed_by,v_conversation_id
 FROM public.agent_inbound_jobs WHERE id=NEW.job_id AND message_id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job missing or message identity mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 SELECT status,claimed_by INTO v_status,v_claimed_by
 FROM public.agent_inbound_jobs WHERE id=NEW.job_id AND message_id=NEW.message_id AND conversation_id=v_conversation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job disappeared'; END IF;
 IF v_status<>'pending' OR v_claimed_by IS NOT NULL THEN
   RAISE EXCEPTION 'Customer Turn member requires unclaimed pending Stage B job, got %/%',v_status,coalesce(v_claimed_by,'unclaimed');
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_agent_customer_turn_member_pending_job ON public.agent_customer_turn_messages;
CREATE TRIGGER guard_agent_customer_turn_member_pending_job
BEFORE INSERT ON public.agent_customer_turn_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_customer_turn_member_pending_job();

REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_pending_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_pending_job() TO service_role;
