
-- Fix: set fixed search_path on the jsonb variant of upsert_agent_v2_turn_analytics
ALTER FUNCTION public.upsert_agent_v2_turn_analytics(jsonb) SET search_path = public;

-- Revoke public/anon/authenticated execution rights on all SECURITY DEFINER functions that shouldn't be publicly callable
REVOKE EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(public.agent_v2_turn_analytics) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM PUBLIC, anon, authenticated;
