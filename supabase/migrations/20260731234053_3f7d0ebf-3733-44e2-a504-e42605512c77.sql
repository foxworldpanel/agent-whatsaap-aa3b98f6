-- 1. Adjust agent humanization settings for Mind SMM Panel
UPDATE public.agent_config 
SET response_delay_min_sec = 2, 
    response_delay_max_sec = 8 
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

-- 2. Update the JSON 'steps' in welcome_funnels for the Mind workspace to reduce delays
-- We use a series of jsonb transformations to safely cap the delay_seconds in each step
UPDATE public.welcome_funnels
SET steps = (
  SELECT jsonb_object_agg(
    key,
    CASE 
      WHEN key = 'audio' THEN (value || jsonb_build_object('delay_seconds', LEAST((value->>'delay_seconds')::int, 15)))
      WHEN key = 'video' THEN (value || jsonb_build_object('delay_seconds', LEAST((value->>'delay_seconds')::int, 10)))
      WHEN key = 'panel_text' THEN (value || jsonb_build_object('delay_seconds', LEAST((value->>'delay_seconds')::int, 8)))
      WHEN key = 'services_text' THEN (value || jsonb_build_object('delay_seconds', LEAST((value->>'delay_seconds')::int, 10)))
      WHEN key = 'welcome_text' THEN (value || jsonb_build_object('delay_seconds', LEAST((value->>'delay_seconds')::int, 5)))
      ELSE value
    END
  )
  FROM jsonb_each(steps)
)
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
AND steps IS NOT NULL;
