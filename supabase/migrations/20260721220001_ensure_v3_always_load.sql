-- Migration manual para garantir a coluna always_load na tabela agent_modules_v3
-- Detectado erro de schema cache no frontend

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='agent_modules_v3' AND column_name='always_load'
    ) THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN always_load boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- Garantir que os índices existam
CREATE INDEX IF NOT EXISTS idx_agent_modules_v3_always_load
  ON public.agent_modules_v3(workspace_id, always_load)
  WHERE enabled = true;

-- Garantir privilégios (padrão do projeto)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v3 TO authenticated;
GRANT ALL ON public.agent_modules_v3 TO service_role;
