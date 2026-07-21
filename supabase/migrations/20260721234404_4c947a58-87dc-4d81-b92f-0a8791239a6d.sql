ALTER TABLE public.agent_modules_v3 ADD COLUMN IF NOT EXISTS always_load boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agent_modules_v3_always_load ON public.agent_modules_v3(workspace_id, always_load) WHERE enabled = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v3 TO authenticated;
GRANT ALL ON public.agent_modules_v3 TO service_role;