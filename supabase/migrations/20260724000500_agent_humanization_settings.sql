-- Configuração operacional de tempo/humanização do Agent V3.
-- Um registro por workspace. Não faz parte do prompt nem dos módulos comerciais.

CREATE TABLE IF NOT EXISTS public.agent_humanization_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  min_response_delay_ms integer NOT NULL DEFAULT 1500 CHECK (min_response_delay_ms BETWEEN 0 AND 30000),
  max_response_delay_ms integer NOT NULL DEFAULT 8000 CHECK (max_response_delay_ms BETWEEN 0 AND 30000),
  typing_enabled boolean NOT NULL DEFAULT true,
  proportional_to_length boolean NOT NULL DEFAULT true,
  min_part_delay_ms integer NOT NULL DEFAULT 1200 CHECK (min_part_delay_ms BETWEEN 0 AND 10000),
  max_part_delay_ms integer NOT NULL DEFAULT 2800 CHECK (max_part_delay_ms BETWEEN 0 AND 10000),
  audio_recording_enabled boolean NOT NULL DEFAULT true,
  playground_delay_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_response_delay_ms >= min_response_delay_ms),
  CHECK (max_part_delay_ms >= min_part_delay_ms)
);

ALTER TABLE public.agent_humanization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent humanization" ON public.agent_humanization_settings;
CREATE POLICY "Users manage own agent humanization"
ON public.agent_humanization_settings
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = agent_humanization_settings.workspace_id
      AND w.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = agent_humanization_settings.workspace_id
      AND w.user_id = auth.uid()
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_humanization_settings TO authenticated;
GRANT ALL ON public.agent_humanization_settings TO service_role;
