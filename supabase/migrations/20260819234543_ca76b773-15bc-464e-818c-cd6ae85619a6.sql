grant select, insert, update, delete on public.lead_finder_leads to authenticated;
grant select, insert, update, delete on public.lead_finder_tags to authenticated;
grant select, insert, update, delete on public.lead_finder_credentials to authenticated;
grant select, insert, update, delete on public.lead_finder_providers to authenticated;
grant select, insert, update, delete on public.lead_finder_jobs to authenticated;
grant select, insert, update, delete on public.lead_finder_provider_runs to authenticated;
grant select, insert, update, delete on public.lead_finder_timeline to authenticated;

grant all on all tables in schema public to service_role;