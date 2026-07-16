-- Fix security warnings for the cleanup function
ALTER FUNCTION public.cleanup_agent_v2_logs() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() TO service_role;
