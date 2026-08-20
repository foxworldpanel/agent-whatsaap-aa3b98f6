-- 1. Update Credentials Table
ALTER TABLE public.lead_finder_credentials 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Fix status type if needed (checking if it's text or enum)
-- If it was created as text in the failed migration, we'll keep it as text for flexibility or convert if possible.
-- For now, let's ensure username is not null for future entries.
ALTER TABLE public.lead_finder_credentials ALTER COLUMN username SET NOT NULL;

-- 2. Update Leads Table
ALTER TABLE public.lead_finder_leads
ADD COLUMN IF NOT EXISTS sales_status public.lead_sales_status DEFAULT 'NEW',
ADD COLUMN IF NOT EXISTS pipeline_stage public.lead_pipeline_stage DEFAULT 'DISCOVERED',
ADD COLUMN IF NOT EXISTS lead_score FLOAT DEFAULT 0;

-- 3. Update Jobs Table
ALTER TABLE public.lead_finder_jobs
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{"leads": 0, "duplicates": 0, "profiles_analyzed": 0, "errors": 0}'::jsonb;

-- 4. Apply Policies (DROP first to avoid conflicts)
DROP POLICY IF EXISTS "Users can manage their own credentials" ON public.lead_finder_credentials;
CREATE POLICY "Users can manage their own credentials"
    ON public.lead_finder_credentials
    FOR ALL
    TO authenticated
    USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can manage leads" ON public.lead_finder_leads;
CREATE POLICY "Authenticated users can manage leads"
    ON public.lead_finder_leads
    FOR ALL
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage tags" ON public.lead_finder_tags;
CREATE POLICY "Authenticated users can manage tags"
    ON public.lead_finder_tags
    FOR ALL
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can manage their own jobs" ON public.lead_finder_jobs;
CREATE POLICY "Users can manage their own jobs"
    ON public.lead_finder_jobs
    FOR ALL
    TO authenticated
    USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can manage provider runs" ON public.lead_finder_provider_runs;
CREATE POLICY "Authenticated users can manage provider runs"
    ON public.lead_finder_provider_runs
    FOR ALL
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage timeline" ON public.lead_finder_timeline;
CREATE POLICY "Authenticated users can manage timeline"
    ON public.lead_finder_timeline
    FOR ALL
    TO authenticated
    USING (true);

-- 5. Ensure GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_credentials TO authenticated;
GRANT ALL ON public.lead_finder_credentials TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_leads TO authenticated;
GRANT ALL ON public.lead_finder_leads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_tags TO authenticated;
GRANT ALL ON public.lead_finder_tags TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_jobs TO authenticated;
GRANT ALL ON public.lead_finder_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_provider_runs TO authenticated;
GRANT ALL ON public.lead_finder_provider_runs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_finder_timeline TO authenticated;
GRANT ALL ON public.lead_finder_timeline TO service_role;
