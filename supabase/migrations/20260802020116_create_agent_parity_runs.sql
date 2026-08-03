-- Tabela pra persistir os resultados do modo sombra (comparação de
-- paridade entre pipeline antigo e buildAgentExecutionContext), pra
-- consulta posterior — ex: SELECT * WHERE equal = false.
CREATE TABLE IF NOT EXISTS public.agent_parity_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_id UUID NOT NULL,
  phone TEXT,
  conversation_id UUID,
  equal BOOLEAN NOT NULL,
  score NUMERIC NOT NULL,
  differences JSONB,
  old_snapshot JSONB,
  new_snapshot JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_parity_runs_equal
  ON public.agent_parity_runs (workspace_id, equal, created_at DESC);

COMMENT ON TABLE public.agent_parity_runs IS
  'Resultados do modo sombra (Shadow Mode) comparando o pipeline atual do webhook com buildAgentExecutionContext(). Usado pra validar paridade antes de migrar o webhook pra usar a função central. Fase de observação — não afeta o atendimento.';
