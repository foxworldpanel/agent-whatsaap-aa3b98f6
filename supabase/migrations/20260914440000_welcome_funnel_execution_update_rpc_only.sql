-- Durable Funnel UPDATE is ownership-sensitive just like INSERT. Application
-- service-role code must not bypass exact-holder transitions or stale-recovery
-- quarantine with direct table updates. SECURITY DEFINER functions continue to
-- mutate the table as their owner while ordinary service_role access is read-only.
REVOKE UPDATE ON public.welcome_funnel_execution_state FROM service_role;
REVOKE UPDATE ON public.welcome_funnel_execution_state FROM PUBLIC, anon, authenticated;

-- Preserve operational inspection only. INSERT was revoked separately and
-- DELETE is already prohibited by the durable evidence guard.
GRANT SELECT ON public.welcome_funnel_execution_state TO service_role;
