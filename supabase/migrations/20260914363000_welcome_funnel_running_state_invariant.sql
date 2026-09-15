-- Running execution is an active lease-like state and must never carry a terminal
-- error or completion timestamp. Terminal shapes were already constrained; tighten
-- the remaining branch without mutating the earlier migration.
ALTER TABLE public.welcome_funnel_execution_state
 DROP CONSTRAINT IF EXISTS welcome_funnel_execution_state_terminal_shape;
ALTER TABLE public.welcome_funnel_execution_state
 ADD CONSTRAINT welcome_funnel_execution_state_terminal_shape CHECK(
  (status='completed' AND completed_at IS NOT NULL AND error_message IS NULL)
  OR (status='needs_review' AND completed_at IS NULL AND nullif(btrim(coalesce(error_message,'')),'') IS NOT NULL)
  OR (status='running' AND completed_at IS NULL AND error_message IS NULL)
 ) NOT VALID;
ALTER TABLE public.welcome_funnel_execution_state VALIDATE CONSTRAINT welcome_funnel_execution_state_terminal_shape;
