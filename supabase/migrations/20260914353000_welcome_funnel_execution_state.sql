-- Keep the legacy welcome_funnel_runs claim schema untouched. This companion
-- state table records whether the claimed synchronous execution actually
-- completed, failed, or requires review after uncertain external side effects.
CREATE TABLE IF NOT EXISTS public.welcome_funnel_execution_state (
 funnel_id uuid NOT NULL,
 contact_id uuid NOT NULL,
 user_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','needs_review')),
 last_completed_step text NULL CHECK(last_completed_step IS NULL OR last_completed_step IN ('welcome_text','audio','panel_text','video','services_text')),
 error_message text NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz NULL,
 PRIMARY KEY(funnel_id,contact_id),
 CONSTRAINT welcome_funnel_execution_state_terminal_shape CHECK(
   (status='completed' AND completed_at IS NOT NULL AND error_message IS NULL)
   OR (status='needs_review' AND completed_at IS NULL AND nullif(btrim(coalesce(error_message,'')),'') IS NOT NULL)
   OR (status='running' AND completed_at IS NULL)
 )
);

CREATE INDEX IF NOT EXISTS welcome_funnel_execution_state_conversation_idx
 ON public.welcome_funnel_execution_state(conversation_id,status,updated_at DESC);

ALTER TABLE public.welcome_funnel_execution_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.welcome_funnel_execution_state FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.welcome_funnel_execution_state TO service_role;
