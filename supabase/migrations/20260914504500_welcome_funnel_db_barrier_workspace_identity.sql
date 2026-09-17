-- Final DB-level Funnel barriers must fail closed on routing identity mismatch,
-- not merely on running/review status. This protects non-webhook/background paths.
CREATE OR REPLACE FUNCTION public.guard_agent_runtime_against_welcome_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.state IN ('processing_safe','processing') AND NEW.state IS DISTINCT FROM OLD.state THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=NEW.conversation_id AND (s.workspace_id IS DISTINCT FROM NEW.workspace_id OR s.status IN ('running','needs_review'))) THEN
   RAISE EXCEPTION 'Agent Customer Turn blocked by durable Welcome Funnel barrier or routing identity mismatch' USING ERRCODE='55000';
  END IF;
 END IF;RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION public.guard_stage_b_runtime_against_welcome_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status IN ('processing_safe','processing') AND NEW.status IS DISTINCT FROM OLD.status THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31));
  IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=NEW.conversation_id AND (s.workspace_id IS DISTINCT FROM NEW.workspace_id OR s.status IN ('running','needs_review'))) THEN
   RAISE EXCEPTION 'Agent Stage B runtime blocked by durable Welcome Funnel barrier or routing identity mismatch' USING ERRCODE='55000';
  END IF;
 END IF;RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_pending_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;v_workspace_id uuid;v_status text;v_claimed_by text;v_message_id uuid;
BEGIN
 SELECT j.conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job missing';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 SELECT j.conversation_id,j.workspace_id,j.status,j.claimed_by,j.message_id INTO v_conversation_id,v_workspace_id,v_status,v_claimed_by,v_message_id FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job disappeared';END IF;
 IF v_message_id IS DISTINCT FROM NEW.message_id THEN RAISE EXCEPTION 'Customer Turn member inbound job identity mismatch';END IF;
 IF v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Customer Turn member requires unclaimed pending Stage B job';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=v_conversation_id AND (s.workspace_id IS DISTINCT FROM v_workspace_id OR s.status IN ('running','needs_review'))) THEN
  RAISE EXCEPTION 'Customer Turn attachment blocked by Welcome Funnel barrier or routing identity mismatch';
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.guard_agent_runtime_against_welcome_funnel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_stage_b_runtime_against_welcome_funnel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_pending_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agent_runtime_against_welcome_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_stage_b_runtime_against_welcome_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_pending_job() TO service_role;
