SET statement_timeout = '120s';
UPDATE public.welcome_funnels
SET steps = jsonb_set(
  steps,
  '{video}',
  COALESCE(steps->'video','{}'::jsonb) - 'url' || jsonb_build_object('url','', 'enabled', false)
)
WHERE (steps->'video'->>'url') LIKE 'data:%'
   OR length(coalesce(steps->'video'->>'url','')) > 2000;

UPDATE public.welcome_funnels
SET steps = jsonb_set(
  steps,
  '{audio}',
  COALESCE(steps->'audio','{}'::jsonb) - 'url' || jsonb_build_object('url','', 'enabled', false)
)
WHERE (steps->'audio'->>'url') LIKE 'data:%'
   OR length(coalesce(steps->'audio'->>'url','')) > 2000;