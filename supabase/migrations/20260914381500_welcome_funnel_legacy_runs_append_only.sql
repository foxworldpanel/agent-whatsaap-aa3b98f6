-- Legacy Welcome Funnel runs are append-only compatibility evidence. Runtime may
-- create a claim and read it, but must never erase/rewrite history to manufacture
-- replay eligibility. Durable execution state is the authoritative replay fence.
REVOKE UPDATE,DELETE ON TABLE public.welcome_funnel_runs FROM service_role;
GRANT SELECT,INSERT ON TABLE public.welcome_funnel_runs TO service_role;
