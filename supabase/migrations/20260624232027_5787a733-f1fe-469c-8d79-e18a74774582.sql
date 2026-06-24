DROP POLICY IF EXISTS "own welcome_funnels" ON public.welcome_funnels;
CREATE POLICY "own welcome_funnels" ON public.welcome_funnels
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own welcome_funnel_runs" ON public.welcome_funnel_runs;
CREATE POLICY "own welcome_funnel_runs" ON public.welcome_funnel_runs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);