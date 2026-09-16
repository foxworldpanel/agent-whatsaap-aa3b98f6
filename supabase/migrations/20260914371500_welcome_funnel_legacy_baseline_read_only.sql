-- The baseline is migration-time evidence. Runtime may classify against it but
-- must not manufacture, rewrite, or delete historical compatibility markers.
REVOKE INSERT,UPDATE,DELETE ON TABLE public.welcome_funnel_legacy_claim_baseline FROM service_role;
GRANT SELECT ON TABLE public.welcome_funnel_legacy_claim_baseline TO service_role;
