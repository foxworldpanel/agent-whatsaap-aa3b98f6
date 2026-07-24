-- Amplia os limites configuráveis de Tempo e Humanização.
-- Resposta: até 120s. Intervalo entre partes: até 30s.

ALTER TABLE public.agent_humanization_settings
  DROP CONSTRAINT IF EXISTS agent_humanization_settings_min_response_delay_ms_check,
  DROP CONSTRAINT IF EXISTS agent_humanization_settings_max_response_delay_ms_check,
  DROP CONSTRAINT IF EXISTS agent_humanization_settings_min_part_delay_ms_check,
  DROP CONSTRAINT IF EXISTS agent_humanization_settings_max_part_delay_ms_check;

ALTER TABLE public.agent_humanization_settings
  ADD CONSTRAINT agent_humanization_settings_min_response_delay_ms_check
    CHECK (min_response_delay_ms BETWEEN 0 AND 120000),
  ADD CONSTRAINT agent_humanization_settings_max_response_delay_ms_check
    CHECK (max_response_delay_ms BETWEEN 0 AND 120000),
  ADD CONSTRAINT agent_humanization_settings_min_part_delay_ms_check
    CHECK (min_part_delay_ms BETWEEN 0 AND 30000),
  ADD CONSTRAINT agent_humanization_settings_max_part_delay_ms_check
    CHECK (max_part_delay_ms BETWEEN 0 AND 30000);
