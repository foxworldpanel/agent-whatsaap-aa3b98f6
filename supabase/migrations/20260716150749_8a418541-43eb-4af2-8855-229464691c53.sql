-- Commit 2: Infraestrutura de Controle e Persistência para Agente V2

-- 1. Tipos e Enums
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_brain_version') THEN
        CREATE TYPE public.agent_brain_version AS ENUM ('v1', 'v2_shadow', 'v2_pilot', 'v2');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_mode') THEN
        CREATE TYPE public.execution_mode AS ENUM ('production', 'shadow', 'pilot');
    END IF;
END $$;

-- 2. Alterações em agent_config (Feature Flag e Pilot Config)
ALTER TABLE public.agent_config 
ADD COLUMN IF NOT EXISTS agent_brain_version public.agent_brain_version DEFAULT 'v1' NOT NULL,
ADD COLUMN IF NOT EXISTS pilot_phone_numbers text[] DEFAULT '{}' NOT NULL;

-- 3. Métricas da V2 (agent_prompt_metrics)
ALTER TABLE public.agent_prompt_metrics
ADD COLUMN IF NOT EXISTS brain_version public.agent_brain_version DEFAULT 'v1' NOT NULL,
ADD COLUMN IF NOT EXISTS execution_mode public.execution_mode DEFAULT 'production' NOT NULL,
ADD COLUMN IF NOT EXISTS sent_to_customer boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS builder_version text,
ADD COLUMN IF NOT EXISTS network text,
ADD COLUMN IF NOT EXISTS service text,
ADD COLUMN IF NOT EXISTS intent text,
ADD COLUMN IF NOT EXISTS selected_modules text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS selected_tools text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS prompt_block_tokens jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS estimated_cost numeric(10,6) DEFAULT 0;

-- 4. Logs da V2 (agent_logs_v2)
CREATE TABLE IF NOT EXISTS public.agent_logs_v2 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    current_message text NOT NULL,
    state jsonb NOT NULL,
    mode text NOT NULL,
    network text,
    service text,
    intent text,
    selected_modules text[] DEFAULT '{}',
    selected_tools text[] DEFAULT '{}',
    prompt_final text,
    response_v2 text,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    cache_creation_input_tokens integer DEFAULT 0,
    cache_read_input_tokens integer DEFAULT 0,
    estimated_cost numeric(10,6) DEFAULT 0,
    model text,
    routing_reason text,
    duration_ms integer DEFAULT 0,
    execution_mode public.execution_mode NOT NULL,
    sent_to_customer boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT ON public.agent_logs_v2 TO authenticated;
GRANT ALL ON public.agent_logs_v2 TO service_role;

ALTER TABLE public.agent_logs_v2 ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own V2 logs' AND tablename = 'agent_logs_v2') THEN
        CREATE POLICY "Users can view their own V2 logs"
        ON public.agent_logs_v2 FOR SELECT
        TO authenticated
        USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));
    END IF;
END $$;

-- 5. Função de Limpeza (Retenção de 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_agent_v2_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.agent_logs_v2
    WHERE created_at < now() - interval '30 days';
    
    DELETE FROM public.agent_prompt_metrics
    WHERE execution_mode = 'shadow' AND created_at < now() - interval '30 days';
END;
$$;
