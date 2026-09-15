-- Snapshot only claims that predate durable Welcome Funnel execution state.
-- This is a compatibility marker, not an assertion that delivery completed.
CREATE TABLE IF NOT EXISTS public.welcome_funnel_legacy_claim_baseline(
 funnel_id uuid NOT NULL,
 contact_id uuid NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(funnel_id,contact_id)
);
INSERT INTO public.welcome_funnel_legacy_claim_baseline(funnel_id,contact_id)
SELECT r.funnel_id,r.contact_id FROM public.welcome_funnel_runs r
ON CONFLICT(funnel_id,contact_id) DO NOTHING;
ALTER TABLE public.welcome_funnel_legacy_claim_baseline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.welcome_funnel_legacy_claim_baseline FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.welcome_funnel_legacy_claim_baseline TO service_role;
