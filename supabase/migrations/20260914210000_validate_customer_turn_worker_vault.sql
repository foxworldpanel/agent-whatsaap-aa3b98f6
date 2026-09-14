-- Fail closed when the durable Customer Turn worker scheduler is installed.
-- The earlier scheduling migration intentionally depends on these Vault values;
-- make that contract explicit before production cutover instead of allowing
-- pg_cron jobs with a NULL/invalid URL or missing authentication header.
DO $$
DECLARE
 v_base_url text;
 v_publishable_key text;
BEGIN
 SELECT nullif(btrim(decrypted_secret),'') INTO v_base_url
 FROM vault.decrypted_secrets
 WHERE name='app_base_url'
 LIMIT 1;

 IF v_base_url IS NULL THEN
  RAISE EXCEPTION 'Missing required Vault secret: app_base_url';
 END IF;

 IF v_base_url !~ '^https?://[^[:space:]]+$' THEN
  RAISE EXCEPTION 'Vault secret app_base_url must be an absolute http(s) URL';
 END IF;

 SELECT nullif(btrim(decrypted_secret),'') INTO v_publishable_key
 FROM vault.decrypted_secrets
 WHERE name='supabase_publishable_key'
 LIMIT 1;

 IF v_publishable_key IS NULL THEN
  RAISE EXCEPTION 'Missing required Vault secret: supabase_publishable_key';
 END IF;
END $$;

-- Recreate the jobs only after the prerequisites above have been validated.
-- This also repairs a partially configured scheduler at cutover time.
DO $$
DECLARE v_job record;
BEGIN
 FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='agent-customer-turn-dispatcher'
 LOOP PERFORM cron.unschedule(v_job.jobid); END LOOP;
 FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='agent-inbound-recovery'
 LOOP PERFORM cron.unschedule(v_job.jobid); END LOOP;
END $$;

SELECT cron.schedule(
 'agent-customer-turn-dispatcher',
 '* * * * *',
 $cron$
 SELECT net.http_post(
  url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1), '/') || '/api/public/hooks/agent-inbound-dispatcher',
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_publishable_key' LIMIT 1)
  ),
  body := '{"max":20}'::jsonb,
  timeout_milliseconds := 50000
 );
 $cron$
);

SELECT cron.schedule(
 'agent-inbound-recovery',
 '*/5 * * * *',
 $cron$
 SELECT net.http_post(
  url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1), '/') || '/api/public/hooks/agent-inbound-recovery',
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_publishable_key' LIMIT 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 50000
 );
 $cron$
);
