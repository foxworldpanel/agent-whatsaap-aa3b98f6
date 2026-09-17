-- Durable Funnel classification must validate the complete execution routing identity.
-- The primary durable key is (funnel_id,contact_id), but a row under that key is
-- authoritative for this request only when conversation, user and workspace all match.
CREATE OR REPLACE FUNCTION public.classify_welcome_funnel_execution(
 p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text;v_conversation_id uuid;v_user_id uuid;v_workspace_id uuid;
BEGIN
 SELECT status,conversation_id,user_id,workspace_id
 INTO v_status,v_conversation_id,v_user_id,v_workspace_id
 FROM public.welcome_funnel_execution_state
 WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id;
 IF FOUND THEN
  IF v_conversation_id IS DISTINCT FROM p_conversation_id
     OR v_user_id IS DISTINCT FROM p_user_id
     OR v_workspace_id IS DISTINCT FROM p_workspace_id THEN
   RETURN 'durable_identity_mismatch';
  END IF;
  RETURN 'durable_'||v_status;
 END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_legacy_claim_baseline WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id) THEN RETURN 'legacy_compatible';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_runs WHERE funnel_id=p_funnel_id AND contact_id=p_contact_id) THEN RETURN 'legacy_ambiguous';END IF;
 RETURN 'unclaimed';
END$$;
REVOKE ALL ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.classify_welcome_funnel_execution(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
