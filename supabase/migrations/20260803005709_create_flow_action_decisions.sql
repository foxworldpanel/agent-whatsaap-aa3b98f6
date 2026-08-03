-- Tabela pra medir a precisão de cada FlowAction individualmente, com
-- revisão manual (campo "correct" começa NULL — preenchido depois que
-- alguém revisa se a decisão bateu com o que a conversa realmente
-- precisava).
--
-- Uso pretendido:
-- 1) Toda vez que o Flow Engine decide algo, um registro nasce aqui
--    (correct = NULL).
-- 2) Periodicamente, alguém revisa uma amostra e marca correct = true/false.
-- 3) Query de precisão por ação:
--    SELECT action, COUNT(*) FILTER (WHERE correct = true) AS acertos,
--           COUNT(*) FILTER (WHERE correct = false) AS erros,
--           ROUND(100.0 * COUNT(*) FILTER (WHERE correct = true) /
--                 NULLIF(COUNT(*) FILTER (WHERE correct IS NOT NULL), 0), 1) AS precisao
--    FROM flow_action_decisions
--    WHERE workspace_id = '...'
--    GROUP BY action;
CREATE TABLE IF NOT EXISTS public.flow_action_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_id UUID NOT NULL,
  phone TEXT,
  conversation_id UUID,
  action TEXT NOT NULL,
  reason TEXT,
  order_context_snapshot JSONB,
  correct BOOLEAN, -- NULL = ainda não revisado
  reviewed_at TIMESTAMPTZ,
  reviewed_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_flow_action_decisions_action
  ON public.flow_action_decisions (workspace_id, action, correct);

COMMENT ON TABLE public.flow_action_decisions IS
  'Registro de cada decisão do Flow Engine, pra medir precisão por ação individualmente antes de promover essa ação pra produção via feature flag (flow-action-flags.server.ts). correct é preenchido por revisão manual.';

-- Query de acompanhamento (rodar quando quiser ver o painel de precisão):
--
-- SELECT
--   action,
--   COUNT(*) AS total_decisoes,
--   COUNT(*) FILTER (WHERE correct IS NOT NULL) AS revisadas,
--   COUNT(*) FILTER (WHERE correct = true) AS acertos,
--   COUNT(*) FILTER (WHERE correct = false) AS erros,
--   ROUND(
--     100.0 * COUNT(*) FILTER (WHERE correct = true) /
--     NULLIF(COUNT(*) FILTER (WHERE correct IS NOT NULL), 0),
--     1
--   ) AS precisao_percentual
-- FROM flow_action_decisions
-- WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
-- GROUP BY action
-- ORDER BY total_decisoes DESC;
