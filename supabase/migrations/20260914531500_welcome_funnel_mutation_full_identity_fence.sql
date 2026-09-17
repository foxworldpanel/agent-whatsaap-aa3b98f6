-- Checkpoints and terminal Funnel transitions must mutate the exact durable routing
-- identity owned by the generation-lock holder, not merely the PK/conversation pair.
CREATE OR REPLACE FUNCTION public.mutate_welcome_funnel_execution(
 p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid,p_holder text,p_operation text,p_step text DEFAULT NULL,p_error_message text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_now timestamptz:=now();v_updated integer:=0;v_status text;v_conversation_id uuid;v_user_id uuid;v_workspace_id uuid;
BEGIN
 IF nullif(btrim(p_holder),'') IS NULL THEN RAISE EXCEPTION 'welcome funnel execution holder is required' USING ERRCODE='22023';END IF;
 IF p_operation NOT IN('checkpoint','completed','needs_review') THEN RAISE EXCEPTION 'invalid welcome funnel execution operation: %',p_operation USING ERRCODE='22023';END IF;
 IF p_operation='checkpoint' AND p_step NOT IN('welcome_text','audio','panel_text','video','services_text') THEN RAISE EXCEPTION 'invalid welcome funnel checkpoint: %',p_step USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 IF NOT EXISTS(SELECT 1 FROM public.agent_generation_locks g WHERE g.conversation_id=p_conversation_id AND g.holder=p_holder) THEN RAISE EXCEPTION 'welcome funnel execution exact holder ownership was lost' USING ERRCODE='55000';END IF;
 SELECT status,conversation_id,user_id,workspace_id INTO v_status,v_conversation_id,v_user_id,v_workspace_id FROM public.welcome_funnel_execution_state WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF v_conversation_id IS DISTINCT FROM p_conversation_id OR v_user_id IS DISTINCT FROM p_user_id OR v_workspace_id IS DISTINCT FROM p_workspace_id THEN RAISE EXCEPTION 'welcome funnel execution durable identity mismatch' USING ERRCODE='55000';END IF;
 IF v_status IS DISTINCT FROM 'running' THEN RETURN false;END IF;
 IF p_operation='checkpoint' THEN UPDATE public.welcome_funnel_execution_state SET last_completed_step=p_step,updated_at=v_now WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id AND conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id AND status='running';
 ELSIF p_operation='completed' THEN UPDATE public.welcome_funnel_execution_state SET status='completed',error_message=NULL,completed_at=v_now,updated_at=v_now WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id AND conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id AND status='running';
 ELSE UPDATE public.welcome_funnel_execution_state SET status='needs_review',error_message=left(coalesce(p_error_message,'unexpected funnel failure'),2000),completed_at=NULL,updated_at=v_now WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id AND conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id AND status='running';END IF;
 GET DIAGNOSTICS v_updated=ROW_COUNT;RETURN v_updated=1;
END$$;
REVOKE ALL ON FUNCTION public.mutate_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.mutate_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_welcome_funnel_execution(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
