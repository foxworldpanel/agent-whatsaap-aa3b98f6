
-- Convert RLS helper functions to SECURITY INVOKER (they only read user's own workspaces, RLS already permits)
ALTER FUNCTION public.user_owns_workspace(uuid) SECURITY INVOKER;
ALTER FUNCTION public.effective_workspace_id(uuid) SECURITY INVOKER;

-- Revoke EXECUTE from PUBLIC (and thus anon/authenticated) on privileged SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_default_workspace_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_single_tenant_workspace() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(text, uuid, text, text, text, text, text, text, integer, integer, numeric, integer, text, jsonb, text, text[], text[], text[], text, text[]) FROM PUBLIC, anon, authenticated;

-- Ensure service_role retains access for server-side use
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(text, uuid, text, text, text, text, text, text, integer, integer, numeric, integer, text, jsonb, text, text[], text[], text[], text, text[]) TO service_role;
