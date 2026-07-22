SELECT cron.unschedule('blast-dispatcher-every-minute');
SELECT cron.unschedule('campaign-dispatcher');
SELECT cron.unschedule('smm-poll-every-5min');

SELECT cron.schedule(
  'blast-dispatcher-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f17d08b0-783c-4c16-863b-2e414ebf709a.lovable.app/api/public/hooks/blast-dispatcher',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhheWZneWNucWFqd3JncnJqd2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzkxNzYsImV4cCI6MjA5NzgxNTE3Nn0.V-_fs1iWmT55IPbsA9eLJQH8PUXtNRmBs7iB5gZk1LM"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'campaign-dispatcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f17d08b0-783c-4c16-863b-2e414ebf709a.lovable.app/api/public/hooks/campaign-dispatcher',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhheWZneWNucWFqd3JncnJqd2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzkxNzYsImV4cCI6MjA5NzgxNTE3Nn0.V-_fs1iWmT55IPbsA9eLJQH8PUXtNRmBs7iB5gZk1LM"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'smm-poll-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f17d08b0-783c-4c16-863b-2e414ebf709a.lovable.app/api/public/hooks/smm-poll',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhheWZneWNucWFqd3JncnJqd2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzkxNzYsImV4cCI6MjA5NzgxNTE3Nn0.V-_fs1iWmT55IPbsA9eLJQH8PUXtNRmBs7iB5gZk1LM"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);