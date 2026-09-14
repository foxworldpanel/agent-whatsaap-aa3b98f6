-- Stage C+D eventual-execution scheduling.
-- Deployment remains a separate gate: this migration only takes effect when the
-- branch migrations are explicitly applied to Supabase.
--
-- Public worker endpoints require a private scheduler secret. Validate all
-- Vault prerequisites before touching cron jobs so cutover fails closed.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
 v_base_url text;
 v_cron_secret text;
BEGIN
 SELECT nullif(btrim(decrypted_secret),'') INTO v_base_url
 FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1;
 IF v_base_url IS NULL THEN
  RAISE EXCEPTION 'Missing required Vault secret: app_base_url';
 END IF;
 IF v_base_url !~ '^https?://[^[:space:]]+$' THEN
  RAISE EXCEPTION 'Vault secret app_base_url must be an absolute http(s) URL';
 END IF;

 SELECT nullif(btrim(decrypted_secret),'') INTO v_cron_secret
 FROM vault.decrypted_secrets WHERE name='agent_cron_secret' LIMIT 1;
 IF v_cron_secret IS NULL THEN
  RAISE EXCEPTION 'Missing required Vault secret: agent_cron_secret';
 END IF;
END $$;

DO $$
DECLARE
 v_job record;
BEGIN
 FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='agent-customer-turn-dispatcher'
 LOOP PERFORM cron.unschedule(v_job.jobid); END LOOP;
 FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='agent-inbound-recovery'
 LOOP PERFORM cron.unschedule(v_job.jobid); END LOOP;
END $$;

-- One-minute cadence is the minimum pg_cron cadence and supplies the durable
-- eventual path when the webhook fast path dies after persisting/attaching a
-- message. Natural-silence (2.2s) is still enforced atomically by the claim RPC.
SELECT cron.schedule(
 'agent-customer-turn-dispatcher',
 '* * * * *',
 $cron$
 SELECT net.http_post(
   url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1), '/')
          || '/api/public/hooks/agent-inbound-dispatcher',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='agent_cron_secret' LIMIT 1)
   ),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
 $cron$
);

-- Recovery is deliberately slower than dispatch. It requeues only stale
-- processing_safe Stage B ownership and quarantines work that may have crossed
-- the external side-effect boundary; Customer Turn stale recovery is also run
-- by every dispatcher batch.
SELECT cron.schedule(
 'agent-inbound-recovery',
 '*/5 * * * *',
 $cron$
 SELECT net.http_post(
   url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1), '/')
          || '/api/public/hooks/agent-inbound-recovery',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='agent_cron_secret' LIMIT 1)
   ),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
 $cron$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules durable Agent V3 dispatcher/recovery and other database jobs.';
