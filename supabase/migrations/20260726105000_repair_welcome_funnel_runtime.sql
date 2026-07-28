-- Agent V3 — robustez do funil de boas-vindas
-- 1) garante as colunas de estado usadas pelo runtime;
-- 2) libera apenas os contatos informados na auditoria de 26/07/2026 para novo teste,
--    pois tiveram disparo ausente/parcial na versão anterior.

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

CREATE INDEX IF NOT EXISTS welcome_funnel_runs_running_idx
  ON public.welcome_funnel_runs (workspace_id, contact_id, updated_at)
  WHERE status = 'running';

-- Reabre somente os três contatos cujo funil falhou/parou pela metade.
-- Ao enviarem novamente o gatilho, receberão a sequência completa.
DELETE FROM public.welcome_funnel_runs r
USING public.contacts c
WHERE r.contact_id = c.id
  AND regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') IN (
    '5514991915367',
    '553192512549',
    '5521974696090'
  );
