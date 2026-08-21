GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_credentials TO authenticated;
GRANT ALL ON public.lead_finder_credentials TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_leads TO authenticated;
GRANT ALL ON public.lead_finder_leads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_jobs TO authenticated;
GRANT ALL ON public.lead_finder_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_tags TO authenticated;
GRANT ALL ON public.lead_finder_tags TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_provider_runs TO authenticated;
GRANT ALL ON public.lead_finder_provider_runs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_timeline TO authenticated;
GRANT ALL ON public.lead_finder_timeline TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_providers TO authenticated;
GRANT ALL ON public.lead_finder_providers TO service_role;