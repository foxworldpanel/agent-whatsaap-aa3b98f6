-- Revoke EXECUTE from public roles on SECURITY DEFINER functions that should not be
-- callable directly by signed-in users. Trigger functions still fire from triggers,
-- and admin functions still run via service_role.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_default_workspace_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) FROM PUBLIC, anon, authenticated;

-- Ensure service_role can still call the admin/trigger functions it invokes.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_categories() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_default_workspace_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, public.conversation_status) TO service_role;