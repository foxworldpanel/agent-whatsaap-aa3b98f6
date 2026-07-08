REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() TO service_role;