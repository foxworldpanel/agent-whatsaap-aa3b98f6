-- The Welcome Funnel attachment barrier replaced this trigger function after the
-- original member-identity invariant was installed. Preserve both guarantees:
-- attachment is advisory-first, the Stage B job is still the exact durable
-- message being attached, and a running/review Funnel blocks membership.
CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_pending_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_conversation_id uuid;
 v_status text;
 v_claimed_by text;
 v_message_id uuid;
BEGIN
 SELECT j.conversation_id INTO v_conversation_id
 FROM public.agent_inbound_jobs j
 WHERE j.id=NEW.job_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Customer Turn member inbound job missing';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));

 SELECT j.conversation_id,j.status,j.claimed_by,j.message_id
 INTO v_conversation_id,v_status,v_claimed_by,v_message_id
 FROM public.agent_inbound_jobs j
 WHERE j.id=NEW.job_id
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Customer Turn member inbound job disappeared';
 END IF;
 IF v_message_id IS DISTINCT FROM NEW.message_id THEN
  RAISE EXCEPTION 'Customer Turn member inbound job identity mismatch';
 END IF;
 IF v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL THEN
  RAISE EXCEPTION 'Customer Turn member requires unclaimed pending Stage B job';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.welcome_funnel_execution_state s
  WHERE s.conversation_id=v_conversation_id
    AND s.status IN ('running','needs_review')
 ) THEN
  RAISE EXCEPTION 'Customer Turn attachment blocked by Welcome Funnel execution barrier';
 END IF;
 RETURN NEW;
END $$;

-- Reinstall explicitly so the final effective function and trigger cannot drift
-- if an earlier migration was partially applied/replayed during homologation.
DROP TRIGGER IF EXISTS guard_agent_customer_turn_member_pending_job ON public.agent_customer_turn_messages;
CREATE TRIGGER guard_agent_customer_turn_member_pending_job
BEFORE INSERT ON public.agent_customer_turn_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_agent_customer_turn_member_pending_job();

REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_pending_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_pending_job() TO service_role;
