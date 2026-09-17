-- Webhook paths know the complete conversation routing identity. Make their Funnel
-- barrier validate user as well as workspace so same-workspace user reassignment
-- fails closed before trigger discovery or Agent attachment.
CREATE OR REPLACE FUNCTION public.get_welcome_funnel_conversation_barrier(p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND (s.workspace_id IS DISTINCT FROM p_workspace_id OR s.user_id IS DISTINCT FROM p_user_id)) THEN RETURN 'identity_mismatch';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.status='needs_review') THEN RETURN 'needs_review';END IF;
 IF EXISTS(SELECT 1 FROM public.welcome_funnel_execution_state s WHERE s.conversation_id=p_conversation_id AND s.workspace_id=p_workspace_id AND s.user_id=p_user_id AND s.status='running') THEN RETURN 'running';END IF;
 RETURN 'clear';
END$$;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_welcome_funnel_conversation_barrier(uuid) FROM PUBLIC,anon,authenticated,service_role;
