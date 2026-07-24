-- Conecta o funil de boas-vindas ao runtime V3 com estado persistente.
-- Registros históricos representam funis já enviados e permanecem como completed.

ALTER TABLE public.welcome_funnel_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_step text,
  ADD COLUMN IF NOT EXISTS last_step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welcome_funnel_runs_status_check'
      AND conrelid = 'public.welcome_funnel_runs'::regclass
  ) THEN
    ALTER TABLE public.welcome_funnel_runs
      ADD CONSTRAINT welcome_funnel_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed'));
  END IF;
END $$;

-- Todo run existente antes desta migration já significava "funil disparado".
UPDATE public.welcome_funnel_runs
SET status = 'completed',
    completed_at = COALESCE(completed_at, fired_at),
    updated_at = now()
WHERE status IS DISTINCT FROM 'completed'
   OR completed_at IS NULL;

CREATE INDEX IF NOT EXISTS welcome_funnel_runs_running_idx
  ON public.welcome_funnel_runs (workspace_id, contact_id, updated_at)
  WHERE status = 'running';
