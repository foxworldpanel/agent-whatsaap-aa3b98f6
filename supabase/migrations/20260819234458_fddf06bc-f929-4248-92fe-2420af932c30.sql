drop policy if exists "Enable all for all" on public.lead_finder_leads;
drop policy if exists "Enable all for all" on public.lead_finder_tags;
drop policy if exists "Enable all for all" on public.lead_finder_credentials;
drop policy if exists "Enable all for all" on public.lead_finder_providers;
drop policy if exists "Enable all for all" on public.lead_finder_jobs;
drop policy if exists "Enable all for all" on public.lead_finder_provider_runs;
drop policy if exists "Enable all for all" on public.lead_finder_timeline;

revoke all on all tables in schema public from anon;

create policy "Enable all for authenticated" on public.lead_finder_leads for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_tags for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_credentials for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_providers for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_jobs for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_provider_runs for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_timeline for all to authenticated using (true);