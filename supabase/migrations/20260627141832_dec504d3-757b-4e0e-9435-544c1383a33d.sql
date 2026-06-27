SET statement_timeout = '120s';
UPDATE public.welcome_funnels
SET steps = jsonb_set(
  steps,
  '{audio}',
  COALESCE(steps->'audio', '{}'::jsonb) - 'url' || jsonb_build_object('url', '', 'enabled', false)
)
WHERE id = '35a9cfe0-4c36-4192-a266-b32876e56bdd';