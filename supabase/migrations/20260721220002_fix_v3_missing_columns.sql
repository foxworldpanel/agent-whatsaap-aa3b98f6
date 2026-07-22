-- Migration para corrigir colunas ausentes na tabela agent_modules_v3
-- Detectado erro de schema cache no frontend para 'selector_conflicts'

DO $$ 
BEGIN
    -- Lista de colunas esperadas pela V3 que podem estar ausentes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_intents') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_intents text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_stages') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_stages text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_platforms') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_platforms text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_products') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_products text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_triggers') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_triggers text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_dependencies') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_dependencies text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='selector_conflicts') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN selector_conflicts text[] NOT NULL DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_modules_v3' AND column_name='always_load') THEN
        ALTER TABLE public.agent_modules_v3 ADD COLUMN always_load boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- Garantir privilégios
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v3 TO authenticated;
GRANT ALL ON public.agent_modules_v3 TO service_role;
