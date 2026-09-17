-- Final privilege reassertion after canonical acquire/refresh/release definitions.
-- service_role may inspect ownership but cannot mutate the lock table directly.
REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role;
REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_generation_locks TO service_role;
