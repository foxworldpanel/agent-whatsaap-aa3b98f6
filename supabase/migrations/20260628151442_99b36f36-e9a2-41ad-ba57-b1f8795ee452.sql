
-- 1. Restrict 5 policies from public role to authenticated
ALTER POLICY "Users manage their own agent logs" ON public.agent_logs TO authenticated;
ALTER POLICY "Users manage own extraction logs" ON public.extraction_logs TO authenticated;
ALTER POLICY "Users manage own forbidden_rules" ON public.forbidden_rules TO authenticated;
ALTER POLICY "fts_owner_all" ON public.free_test_services TO authenticated;
ALTER POLICY "Users manage own panel guide" ON public.panel_guide TO authenticated;

-- 2. integrations: hide secret columns from client (authenticated role).
--    Keep INSERT/UPDATE/DELETE possible for owner via RLS; reads of secrets
--    go through server functions using the service role.
REVOKE SELECT ON public.integrations FROM authenticated;
GRANT SELECT (
  user_id,
  uazapi_url,
  elevenlabs_voice_id,
  smm_service_id,
  smm_panel_url,
  free_trial_enabled,
  smm_last_sync_at,
  smm_last_sync_count,
  smm_last_sync_error,
  updated_at
) ON public.integrations TO authenticated;

-- 3. whatsapp_numbers: hide token columns from client.
REVOKE SELECT ON public.whatsapp_numbers FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  nome,
  uazapi_url,
  status,
  meta_ads_enabled,
  disparos_mode,
  last_connected_at,
  created_at,
  updated_at,
  welcome_funnel
) ON public.whatsapp_numbers TO authenticated;

-- Ensure service_role keeps full access (it does by default, but reaffirm).
GRANT ALL ON public.integrations TO service_role;
GRANT ALL ON public.whatsapp_numbers TO service_role;
