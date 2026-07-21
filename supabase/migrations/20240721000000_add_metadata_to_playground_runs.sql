ALTER TABLE public.agent_playground_runs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
GRANT ALL ON public.agent_playground_runs TO authenticated;
GRANT ALL ON public.agent_playground_runs TO service_role;
