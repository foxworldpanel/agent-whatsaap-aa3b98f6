-- Durable Welcome Funnel execution rows are ownership-sensitive. Application
-- code must not bypass the exact-holder start/quarantine RPCs with a direct
-- service-role INSERT. SECURITY DEFINER RPCs continue to insert as their owner.
REVOKE INSERT ON public.welcome_funnel_execution_state FROM service_role;
REVOKE INSERT ON public.welcome_funnel_execution_state FROM PUBLIC, anon, authenticated;

-- Reads and guarded running->terminal updates remain available to service_role.
-- DELETE was already fenced separately; retain the existing non-insert surface.
GRANT SELECT, UPDATE, DELETE ON public.welcome_funnel_execution_state TO service_role;
