-- Ambiguous legacy quarantine must never transiently create a second running Funnel,
-- and existing durable evidence must match the requested routing identity.
CREATE OR REPLACE FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid,p_holder text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;v_conversation_id uuid;v_user_id uuid;v_workspace_id uuid;
BEGIN
 IF nullif(btrim(p_holder),'') IS NULL THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires a lock holder' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 SELECT status,conversation_id,user_id,workspace_id INTO v_status,v_conversation_id,v_user_id,v_workspace_id FROM public.welcome_funnel_execution_state WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id;
 IF FOUND THEN
  IF v_conversation_id IS DISTINCT FROM p_conversation_id OR v_user_id IS DISTINCT FROM p_user_id OR v_workspace_id IS DISTINCT FROM p_workspace_id THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine durable identity mismatch' USING ERRCODE='55000';END IF;
  RETURN v_status='needs_review';
 END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_legacy_claim_baseline WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id) THEN RAISE EXCEPTION 'historical Welcome Funnel baseline cannot be quarantined as ambiguous' USING ERRCODE='55000';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.welcome_funnel_runs WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id) THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires a legacy claim' USING ERRCODE='55000';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_generation_locks WHERE conversation_id=p_conversation_id AND holder=p_holder) THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine requires exact generation lock ownership' USING ERRCODE='55000';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND (s.workspace_id IS DISTINCT FROM p_workspace_id OR s.user_id IS DISTINCT FROM p_user_id)) THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine conversation identity mismatch' USING ERRCODE='55000';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state WHERE conversation_id=p_conversation_id AND status='running') THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine blocked by active Funnel execution' USING ERRCODE='55000';END IF;
 INSERT INTO public.welcome_funnel_execution_state(funnel_id,contact_id,conversation_id,user_id,workspace_id,status,last_completed_step,error_message,started_at,updated_at,completed_at)VALUES(p_funnel_id,p_contact_id,p_conversation_id,p_user_id,p_workspace_id,'running',NULL,NULL,now(),now(),NULL);
 UPDATE public.welcome_funnel_execution_state SET status='needs_review',error_message='legacy Welcome Funnel claim has no historical baseline or durable completion evidence',updated_at=now(),completed_at=NULL WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id AND conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id AND status='running';
 IF NOT FOUND THEN RAISE EXCEPTION 'ambiguous Welcome Funnel quarantine transition was not persisted' USING ERRCODE='55000';END IF;RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid,text) TO service_role;
