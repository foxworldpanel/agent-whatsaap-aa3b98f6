-- A terminal durable execution is evidence that the same funnel/contact execution
-- must not be silently restarted. Completed and needs_review require normal
-- fallthrough or explicit/manual audited handling, never a fresh running INSERT.
CREATE OR REPLACE FUNCTION public.start_welcome_funnel_execution(
 p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid,p_holder text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;
BEGIN
 IF nullif(btrim(p_holder),'') IS NULL THEN RAISE EXCEPTION 'Welcome Funnel start requires a lock holder' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 IF NOT EXISTS(SELECT 1 FROM public.agent_generation_locks WHERE conversation_id=p_conversation_id AND holder=p_holder) THEN RAISE EXCEPTION 'Welcome Funnel start requires exact generation lock ownership' USING ERRCODE='55000'; END IF;

 SELECT status INTO v_status FROM public.welcome_funnel_execution_state
 WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id
   AND conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id;
 IF FOUND THEN
  IF v_status='running' THEN RETURN true; END IF;
  RAISE EXCEPTION 'Welcome Funnel start blocked by terminal durable execution state: %',v_status USING ERRCODE='55000';
 END IF;

 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state WHERE conversation_id=p_conversation_id AND status='running') THEN RAISE EXCEPTION 'Welcome Funnel start blocked by active Funnel execution' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.agent_customer_turns WHERE conversation_id=p_conversation_id AND state IN ('processing_safe','processing')) OR EXISTS(SELECT 1 FROM public.agent_inbound_jobs WHERE conversation_id=p_conversation_id AND status IN ('processing_safe','processing')) THEN RAISE EXCEPTION 'Welcome Funnel start blocked by active Agent runtime' USING ERRCODE='55000'; END IF;
 INSERT INTO public.welcome_funnel_execution_state(funnel_id,contact_id,conversation_id,user_id,workspace_id,status,last_completed_step,error_message,started_at,updated_at,completed_at)
 VALUES(p_funnel_id,p_contact_id,p_conversation_id,p_user_id,p_workspace_id,'running',NULL,NULL,now(),now(),NULL);
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.start_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text) TO service_role;
