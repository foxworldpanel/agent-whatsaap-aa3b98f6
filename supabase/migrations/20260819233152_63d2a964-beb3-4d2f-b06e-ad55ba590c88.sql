-- 1. Enums
create type public.lead_sales_status as enum ('NEW', 'QUEUED', 'CONTACTED', 'RESPONDED', 'QUALIFIED', 'CONVERTED', 'LOST');
create type public.lead_pipeline_stage as enum ('DISCOVERED', 'ENRICHED', 'READY_FOR_SALES', 'IN_CAMPAIGN', 'CONTACTED', 'RESPONDED', 'QUALIFIED', 'CUSTOMER');
create type public.job_status as enum ('PENDING', 'RUNNING', 'FINISHED', 'FAILED', 'PAUSED', 'CANCELLED');

-- 2. Tables

-- lead_finder_leads
create table public.lead_finder_leads (
    id uuid primary key default gen_random_uuid(),
    platform text not null,
    profile_username text not null,
    profile_url text,
    display_name text,
    bio text,
    phone text,
    email text,
    website text,
    links jsonb default '[]'::jsonb,
    lead_origin text,
    lead_origin_value text,
    raw_profile_data jsonb default '{}'::jsonb,
    customer_type text,
    segment text,
    priority text,
    confidence decimal(3,2),
    lead_score integer,
    lead_score_reason text,
    ai_version text,
    pipeline_stage public.lead_pipeline_stage not null default 'DISCOVERED',
    sales_status public.lead_sales_status not null default 'NEW',
    discovered_at timestamp with time zone default now(),
    last_seen_at timestamp with time zone default now(),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(platform, profile_username)
);

-- lead_finder_tags
create table public.lead_finder_tags (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references public.lead_finder_leads(id) on delete cascade,
    tag text not null,
    created_at timestamp with time zone default now()
);

-- lead_finder_credentials
create table public.lead_finder_credentials (
    id uuid primary key default gen_random_uuid(),
    provider_type text not null,
    account_name text not null,
    status text not null default 'active',
    config jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- lead_finder_providers
create table public.lead_finder_providers (
    id uuid primary key default gen_random_uuid(),
    provider_type text not null,
    provider_key text not null unique,
    status text not null default 'enabled',
    config jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- lead_finder_jobs
create table public.lead_finder_jobs (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid references public.lead_finder_providers(id),
    status public.job_status not null default 'PENDING',
    config jsonb default '{}'::jsonb,
    stats jsonb default '{}'::jsonb,
    created_by uuid references auth.users(id),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- lead_finder_provider_runs
create table public.lead_finder_provider_runs (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.lead_finder_jobs(id) on delete cascade,
    provider_key text not null,
    credential_id uuid references public.lead_finder_credentials(id),
    status text not null default 'running',
    error_message text,
    finished_at timestamp with time zone,
    created_at timestamp with time zone default now()
);

-- lead_finder_timeline
create table public.lead_finder_timeline (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references public.lead_finder_leads(id) on delete cascade,
    event text not null,
    created_at timestamp with time zone default now()
);

-- 3. Grants
grant select, insert, update, delete on public.lead_finder_leads to authenticated;
grant select, insert, update, delete on public.lead_finder_tags to authenticated;
grant select, insert, update, delete on public.lead_finder_credentials to authenticated;
grant select, insert, update, delete on public.lead_finder_providers to authenticated;
grant select, insert, update, delete on public.lead_finder_jobs to authenticated;
grant select, insert, update, delete on public.lead_finder_provider_runs to authenticated;
grant select, insert, update, delete on public.lead_finder_timeline to authenticated;

grant all on public.lead_finder_leads to service_role;
grant all on public.lead_finder_tags to service_role;
grant all on public.lead_finder_credentials to service_role;
grant all on public.lead_finder_providers to service_role;
grant all on public.lead_finder_jobs to service_role;
grant all on public.lead_finder_provider_runs to service_role;
grant all on public.lead_finder_timeline to service_role;

-- 4. RLS
alter table public.lead_finder_leads enable row level security;
alter table public.lead_finder_tags enable row level security;
alter table public.lead_finder_credentials enable row level security;
alter table public.lead_finder_providers enable row level security;
alter table public.lead_finder_jobs enable row level security;
alter table public.lead_finder_provider_runs enable row level security;
alter table public.lead_finder_timeline enable row level security;

-- Basic policies (authenticated access)
create policy "Allow all for authenticated users" on public.lead_finder_leads for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_tags for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_credentials for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_providers for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_jobs for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_provider_runs for all to authenticated using (true);
create policy "Allow all for authenticated users" on public.lead_finder_timeline for all to authenticated using (true);
