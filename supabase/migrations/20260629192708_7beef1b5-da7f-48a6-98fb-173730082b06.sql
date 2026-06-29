ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS panel_screenshots_mobile jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS panel_screenshots_desktop jsonb NOT NULL DEFAULT '[]'::jsonb;