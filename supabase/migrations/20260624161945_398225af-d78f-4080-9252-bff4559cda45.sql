GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_trials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

GRANT ALL ON public.agent_config TO service_role;
GRANT ALL ON public.campaign_logs TO service_role;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.contacts TO service_role;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.free_trials TO service_role;
GRANT ALL ON public.integrations TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.profiles TO service_role;