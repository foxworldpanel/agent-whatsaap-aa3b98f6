-- Funnel Control Center
-- Operational status, pause/resume/retry metadata and event timeline.

ALTER TABLE public.welcome_funnel_runs
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'trigger';

ALTER TABLE public.welcome_funnel_runs
  DROP CONSTRAINT IF EXISTS welcome_funnel_runs_status_check;

ALTER TABLE public.welcome_funnel_runs
  ADD CONSTRAINT welcome_funnel_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'paused'));

CREATE INDEX IF NOT EXISTS welcome_funnel_runs_status_workspace_idx
  ON public.welcome_funnel_runs(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.welcome_funnel_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.welcome_funnels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  step_key text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS welcome_funnel_run_events_lookup_idx
  ON public.welcome_funnel_run_events(workspace_id, funnel_id, contact_id, created_at DESC);

ALTER TABLE public.welcome_funnel_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_scoped ON public.welcome_funnel_run_events;
CREATE POLICY workspace_scoped ON public.welcome_funnel_run_events
FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND public.user_owns_workspace(workspace_id)
  AND workspace_id = public.effective_workspace_id(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND public.user_owns_workspace(workspace_id)
  AND workspace_id = public.effective_workspace_id(auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_funnel_run_events TO authenticated;
GRANT ALL ON public.welcome_funnel_run_events TO service_role;
