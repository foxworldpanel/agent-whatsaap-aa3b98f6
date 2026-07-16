-- Remediação de segurança para funções analíticas
REVOKE ALL ON FUNCTION public.cleanup_agent_v2_analytics() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;

REVOKE ALL ON FUNCTION public.upsert_agent_v2_turn_analytics(public.agent_v2_turn_analytics) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(public.agent_v2_turn_analytics) TO service_role;
