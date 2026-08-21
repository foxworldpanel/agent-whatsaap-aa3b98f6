DROP POLICY IF EXISTS "Users can manage their own credentials" ON public.lead_finder_credentials;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.lead_finder_credentials;
CREATE POLICY "Allow all for authenticated users"
    ON public.lead_finder_credentials
    FOR ALL
    TO authenticated
    USING (true);