-- Stage B has workspace identity but the immutable Customer Turn member snapshot also
-- carries user routing identity. Resolve the live conversation user under the canonical
-- conversation fence and refuse attachment when an existing collecting turn belongs to
-- a different user. This prevents a reassignment from silently mixing semantic turns.
CREATE OR REPLACE FUNCTION public.guard_agent_customer_turn_member_pending_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_conversation_id uuid;v_workspace_id uuid;v_status text;v_claimed_by text;v_message_id uuid;v_user_id uuid;v_turn_workspace_id uuid;v_turn_user_id uuid;
BEGIN
 SELECT j.conversation_id INTO v_conversation_id FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job missing';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31));
 SELECT j.conversation_id,j.workspace_id,j.status,j.claimed_by,j.message_id INTO v_conversation_id,v_workspace_id,v_status,v_claimed_by,v_message_id FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer Turn member inbound job disappeared';END IF;
 IF v_message_id IS DISTINCT FROM NEW.message_id THEN RAISE EXCEPTION 'Customer Turn member inbound job identity mismatch' USING ERRCODE='55000';END IF;
 IF v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Customer Turn member requires unclaimed pending Stage B job' USING ERRCODE='55000';END IF;
 SELECT c.user_id INTO v_user_id FROM public.conversations c WHERE c.id=v_conversation_id AND c.workspace_id=v_workspace_id;
 IF NOT FOUND OR v_user_id IS NULL THEN RAISE EXCEPTION 'Customer Turn member conversation routing identity missing' USING ERRCODE='55000';END IF;
 SELECT t.workspace_id,tm.user_id INTO v_turn_workspace_id,v_turn_user_id FROM public.agent_customer_turns t LEFT JOIN LATERAL(SELECT m.user_id FROM public.agent_customer_turn_messages m WHERE m.turn_id=t.id ORDER BY m.ordinal LIMIT 1)tm ON true WHERE t.id=NEW.turn_id AND t.conversation_id=v_conversation_id FOR UPDATE OF t;
 IF NOT FOUND OR v_turn_workspace_id IS DISTINCT FROM v_workspace_id THEN RAISE EXCEPTION 'Customer Turn member turn workspace identity mismatch' USING ERRCODE='55000';END IF;
 IF v_turn_user_id IS NOT NULL AND v_turn_user_id IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'Customer Turn member turn user routing identity mismatch' USING ERRCODE='55000';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=v_conversation_id AND (s.workspace_id IS DISTINCT FROM v_workspace_id OR s.user_id IS DISTINCT FROM v_user_id OR s.status IN('running','needs_review'))) THEN RAISE EXCEPTION 'Customer Turn attachment blocked by Welcome Funnel barrier or routing identity mismatch' USING ERRCODE='55000';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.guard_agent_customer_turn_member_pending_job() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.guard_agent_customer_turn_member_pending_job() TO service_role;
