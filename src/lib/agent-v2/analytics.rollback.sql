-- Rollback Analytics Engine V2

-- 1. Funções dependentes
DROP FUNCTION IF EXISTS public.cleanup_agent_v2_analytics();

-- 2. Policies
DROP POLICY IF EXISTS agent_v2_turn_select ON public.agent_v2_turn_analytics;
DROP POLICY IF EXISTS agent_v2_conversation_select ON public.agent_v2_conversation_analytics;
DROP POLICY IF EXISTS agent_v2_model_pricing_select ON public.agent_v2_model_pricing;

-- 3. Tabelas (Ordem reversa de dependência)
DROP TABLE IF EXISTS public.agent_v2_conversation_analytics;
DROP TABLE IF EXISTS public.agent_v2_turn_analytics;
DROP TABLE IF EXISTS public.agent_v2_model_pricing;

-- Nota: CREATE EXTENSION IF NOT EXISTS btree_gist não é removida para evitar quebra de outras dependências.
