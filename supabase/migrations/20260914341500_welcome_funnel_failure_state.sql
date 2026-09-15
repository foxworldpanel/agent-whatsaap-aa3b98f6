-- Keep welcome_funnel_runs compatible with the deployed five-column schema.
-- Durable operational failure belongs on the conversation until a dedicated
-- resumable funnel-run schema exists. Never advertise exact-step replay here.

CREATE OR REPLACE FUNCTION public.mark_welcome_funnel_conversation_failed(
 p_conversation_id uuid,
 p_workspace_id uuid,
 p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_changed integer;
BEGIN
 IF p_conversation_id IS NULL OR p_workspace_id IS NULL THEN RETURN false; END IF;
 UPDATE public.conversations
 SET needs_review=true,
     review_reason=left(coalesce(nullif(btrim(p_reason),''),'falha no funil de boas-vindas'),1000)
 WHERE id=p_conversation_id AND workspace_id=p_workspace_id;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN v_changed=1;
END $$;

REVOKE ALL ON FUNCTION public.mark_welcome_funnel_conversation_failed(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_welcome_funnel_conversation_failed(uuid,uuid,text) TO service_role;
