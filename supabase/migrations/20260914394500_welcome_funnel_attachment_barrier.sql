-- Runtime ownership is authoritative. A Welcome Funnel in running/needs_review
-- must also block Stage-B attachment so newly received messages remain durable
-- pending work instead of being grouped into a turn that cannot execute yet.
CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_pending_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid; v_status text; v_claimed_by text; v_message_id uuid;
BEGIN
 SELECT j.conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id;
 IF v_conversation_id IS NULL THEN RAISE EXCEPTION 'Agent inbound job missing for Customer Turn member'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 SELECT j.conversation_id,j.status,j.claimed_by,j.message_id INTO v_conversation_id,v_status,v_claimed_by,v_message_id
 FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Customer Turn member requires unclaimed pending Stage B job'; END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=v_conversation_id AND s.status IN ('running','needs_review')) THEN
  RAISE EXCEPTION 'Customer Turn attachment blocked by Welcome Funnel execution barrier';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_pending_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_pending_job() TO service_role;
