CREATE TABLE IF NOT EXISTS public.agent_prompt_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL,
  routing_reason text NULL,
  total_chars integer NOT NULL DEFAULT 0,
  est_tokens integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  active_modules_count integer NOT NULL DEFAULT 0,
  active_module_names text[] NOT NULL DEFAULT '{}',
  kb_examples_count integer NOT NULL DEFAULT 0,
  panel_screens_count integer NOT NULL DEFAULT 0,
  faqs_selected_count integer NOT NULL DEFAULT 0,
  forbidden_rules_count integer NOT NULL DEFAULT 0,
  free_test_services_count integer NOT NULL DEFAULT 0,
  history_count integer NOT NULL DEFAULT 0,
  contexto_detectado text NULL
);

CREATE INDEX IF NOT EXISTS agent_prompt_metrics_user_created_idx
  ON public.agent_prompt_metrics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_prompt_metrics_created_idx
  ON public.agent_prompt_metrics (created_at DESC);

GRANT SELECT ON public.agent_prompt_metrics TO authenticated;
GRANT ALL ON public.agent_prompt_metrics TO service_role;

ALTER TABLE public.agent_prompt_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_metrics_select"
  ON public.agent_prompt_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cleanup_old_agent_prompt_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.agent_prompt_metrics WHERE created_at < now() - INTERVAL '30 days';
END;
$$;