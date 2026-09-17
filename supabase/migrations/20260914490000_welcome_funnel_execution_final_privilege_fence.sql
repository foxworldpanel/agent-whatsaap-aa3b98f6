-- Final table-level capability boundary for durable Welcome Funnel evidence.
-- Runtime reads are allowed; ownership-sensitive mutations remain available only
-- through the audited SECURITY DEFINER start/quarantine/transition/recovery RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.welcome_funnel_execution_state FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.welcome_funnel_execution_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.welcome_funnel_execution_state TO service_role;
