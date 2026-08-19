GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_provider_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_timeline TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;