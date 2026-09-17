-- Durable Welcome Funnel execution rows are ownership-sensitive. Application
-- code must not bypass the exact-holder start/quarantine RPCs with a direct
-- service-role INSERT. SECURITY DEFINER RPCs continue to insert as their owner.
REVOKE INSERT ON public.welcome_funnel_execution_state FROM service_role;
REVOKE INSERT ON public.welcome_funnel_execution_state FROM PUBLIC, anon, authenticated;

-- Keep this migration monotonic: do not re-grant DELETE here because the earlier
-- durable-evidence delete guard already revoked it. UPDATE is revoked by the
-- later RPC-only transition migration. Runtime inspection remains readable.
GRANT SELECT, UPDATE ON public.welcome_funnel_execution_state TO service_role;
