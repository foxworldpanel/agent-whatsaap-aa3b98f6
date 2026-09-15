-- Durable funnel mutations need an execution owner, not merely status='running'.
-- Without it, a stale/duplicate invocation could checkpoint or quarantine another
-- invocation that currently owns the same funnel/contact execution.
ALTER TABLE public.welcome_funnel_execution_state
 ADD COLUMN IF NOT EXISTS execution_holder text;
ALTER TABLE public.welcome_funnel_execution_state
 ADD CONSTRAINT welcome_funnel_execution_holder_shape CHECK(
  (status='running' AND nullif(btrim(coalesce(execution_holder,'')),'') IS NOT NULL)
  OR (status IN('completed','needs_review') AND execution_holder IS NULL)
 ) NOT VALID;
