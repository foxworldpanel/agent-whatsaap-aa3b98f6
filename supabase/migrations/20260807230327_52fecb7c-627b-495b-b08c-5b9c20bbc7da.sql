
-- 1. Resolver avisos de SECURITY DEFINER (restringir execução ao service_role/authenticated se necessário)
-- A função log_agent_modules_v3_history só deve ser executada pelo sistema (service_role) via trigger.
REVOKE ALL ON FUNCTION public.log_agent_modules_v3_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_agent_modules_v3_history() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_agent_modules_v3_history() TO authenticated;

-- 2. Resolver RLS em tabelas sem política (Linter INFO 1 e 2)
-- Identificar as tabelas que estão com RLS mas sem políticas e aplicar uma política padrão de service_role ou isolamento.
-- Por agora, vamos apenas garantir que a agent_modules_v3_history_old (backup) tenha uma política se o RLS estiver on.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_modules_v3_history_old') THEN
        ALTER TABLE public.agent_modules_v3_history_old ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Service role only" ON public.agent_modules_v3_history_old;
        CREATE POLICY "Service role only" ON public.agent_modules_v3_history_old TO service_role USING (true);
    END IF;
END $$;
