-- Stage C+D eventual-execution scheduling.
-- Deployment remains a separate gate: this migration only takes effect when the
-- branch migrations are explicitly applied to Supabase.
--
-- The application endpoints validate the project's publishable/anon key via
-- assertCronAuthorized. pg_cron reads that key and the app base URL from Vault,
-- matching the existing project cron convention.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
 v_dispatcher_job bigint;
 v_recovery_job bigint;
BEGIN
 SELECT jobid INTO v_dispatcher_job FROM cron.job WHERE jobname='agent-customer-turn-dispatcher';
 IF v_dispatcher_job IS NOT NULL THEN PERFORM cron.unschedule(v_dispatcher_job); END IF;

 SELECT jobid INTO v_recovery_job FROM cron.job WHERE jobname='agent-inbound-recovery';
 IF v_recovery_job IS NOT NULL THEN PERFORM cron.unschedule(v_recovery_job); END IF;
END $$;

-- One-minute cadence is the minimum pg_cron cadence and supplies the durable
-- eventual path when the webhook fast path dies after persisting/attaching a
-- message. Natural-silence (2.2s) is still enforced atomically by the claim RPC.
SELECT cron.schedule(
 'agent-customer-turn-dispatcher',
 '* * * * *',
 $cron$
 SELECT net.http_post(
   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1)
          || '/api/public/hooks/agent-inbound-dispatcher',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_publishable_key' LIMIT 1)
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
   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url' LIMIT 1)
          || '/api/public/hooks/agent-inbound-recovery',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_publishable_key' LIMIT 1)
   ),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
 $cron$
);

COMMENT ON EXTENSION pg_cron IS 'Schedules durable Agent V3 dispatcher/recovery and other database jobs.';