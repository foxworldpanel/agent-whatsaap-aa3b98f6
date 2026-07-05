
-- Revoke public EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_default_workspace_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_workspace(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_workspace_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_workspace_id() FROM PUBLIC, anon;

-- get_or_create_active_conversation is called via service_role from server functions
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) FROM authenticated;

-- RLS helpers must remain executable by authenticated for policies to work.
-- Grant explicitly (already implicit via PUBLIC previously) to make intent clear.
GRANT EXECUTE ON FUNCTION public.user_owns_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_workspace_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated;
