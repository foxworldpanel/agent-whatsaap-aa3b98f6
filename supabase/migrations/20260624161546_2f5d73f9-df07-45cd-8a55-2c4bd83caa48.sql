DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_config','campaign_logs','campaigns','contacts','conversations','free_trials','integrations','messages','profiles']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;