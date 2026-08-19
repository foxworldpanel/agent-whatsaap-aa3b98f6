alter table public.lead_finder_leads enable row level security;
alter table public.lead_finder_tags enable row level security;
alter table public.lead_finder_credentials enable row level security;
alter table public.lead_finder_providers enable row level security;
alter table public.lead_finder_jobs enable row level security;
alter table public.lead_finder_provider_runs enable row level security;
alter table public.lead_finder_timeline enable row level security;

create policy "Enable all for authenticated" on public.lead_finder_leads for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_tags for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_credentials for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_providers for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_jobs for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_provider_runs for all to authenticated using (true);
create policy "Enable all for authenticated" on public.lead_finder_timeline for all to authenticated using (true);