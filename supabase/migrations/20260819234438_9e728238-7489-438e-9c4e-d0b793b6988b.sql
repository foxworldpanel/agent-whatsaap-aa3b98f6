drop policy if exists "Enable all for authenticated" on public.lead_finder_leads;
drop policy if exists "Enable all for authenticated" on public.lead_finder_tags;
drop policy if exists "Enable all for authenticated" on public.lead_finder_credentials;
drop policy if exists "Enable all for authenticated" on public.lead_finder_providers;
drop policy if exists "Enable all for authenticated" on public.lead_finder_jobs;
drop policy if exists "Enable all for authenticated" on public.lead_finder_provider_runs;
drop policy if exists "Enable all for authenticated" on public.lead_finder_timeline;

create policy "Enable all for all" on public.lead_finder_leads for all using (true);
create policy "Enable all for all" on public.lead_finder_tags for all using (true);
create policy "Enable all for all" on public.lead_finder_credentials for all using (true);
create policy "Enable all for all" on public.lead_finder_providers for all using (true);
create policy "Enable all for all" on public.lead_finder_jobs for all using (true);
create policy "Enable all for all" on public.lead_finder_provider_runs for all using (true);
create policy "Enable all for all" on public.lead_finder_timeline for all using (true);

grant all on all tables in schema public to anon;