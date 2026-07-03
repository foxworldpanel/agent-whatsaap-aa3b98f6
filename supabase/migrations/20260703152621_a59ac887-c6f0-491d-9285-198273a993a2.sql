
-- 1) agent_logs: remove orphan rows and enforce user_id
DELETE FROM public.agent_logs WHERE user_id IS NULL;
ALTER TABLE public.agent_logs ALTER COLUMN user_id SET NOT NULL;

-- 2) integrations: revoke all direct client access; server code uses service role
REVOKE ALL ON public.integrations FROM anon, authenticated;
GRANT ALL ON public.integrations TO service_role;

-- 3) whatsapp_numbers: keep non-sensitive columns readable by owners via RLS,
--    but revoke access to token columns (uazapi_token, uazapi_admin_token, uazapi_url).
REVOKE ALL ON public.whatsapp_numbers FROM anon, authenticated;
GRANT SELECT
  (id, user_id, nome, status, meta_ads_enabled, disparos_mode,
   last_connected_at, created_at, updated_at,
   warmup_started_at, warmup_enabled, auto_pause_on_risk,
   risk_level, last_risk_check_at)
  ON public.whatsapp_numbers TO authenticated;
GRANT ALL ON public.whatsapp_numbers TO service_role;

-- 4) processed_messages: replace deny-all policy with an explicit service-role policy
DROP POLICY IF EXISTS "service role only" ON public.processed_messages;
CREATE POLICY "service role manages processed messages"
  ON public.processed_messages
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
GRANT ALL ON public.processed_messages TO service_role;
