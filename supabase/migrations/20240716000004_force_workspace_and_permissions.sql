-- Ensure workspaces table is solid
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspaces') THEN
        CREATE TABLE public.workspaces (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
            nome text NOT NULL,
            icone text DEFAULT '💼',
            cor text DEFAULT 'blue',
            is_default boolean DEFAULT false,
            created_at timestamptz DEFAULT now()
        );
        GRANT ALL ON public.workspaces TO authenticated;
        GRANT ALL ON public.workspaces TO service_role;
        ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage own workspaces" ON public.workspaces FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
END $$;

-- Ensure agent_config table is solid
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_config') THEN
        CREATE TABLE public.agent_config (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
            workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
            agent_enabled boolean DEFAULT true,
            agent_name text DEFAULT 'Júlia',
            tone text DEFAULT 'Profissional e prestativa',
            base_instruction text,
            script_frio text,
            script_inativo text,
            script_ativo text,
            main_offer text,
            audio_enabled boolean DEFAULT false,
            response_delay_min_sec integer DEFAULT 30,
            response_delay_max_sec integer DEFAULT 120,
            typing_indicator_enabled boolean DEFAULT true,
            services_realtime boolean DEFAULT false,
            modules jsonb DEFAULT '{}'::jsonb,
            modules_enabled jsonb DEFAULT '{}'::jsonb,
            created_at timestamptz DEFAULT now(),
            UNIQUE(user_id, workspace_id)
        );
        GRANT ALL ON public.agent_config TO authenticated;
        GRANT ALL ON public.agent_config TO service_role;
        ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage own agent_config" ON public.agent_config FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
END $$;

-- Ensure agent_identity table is solid
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agent_identity') THEN
        CREATE TABLE public.agent_identity (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
            workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
            persona text,
            regra_emoji text,
            regra_split text,
            terminologia_redes text,
            regra_teste_gratis text,
            regra_anti_invencao text,
            exemplo_disparo text,
            reconhecimento_interesse text,
            regra_encerramento text,
            regra_estilo_escrita text,
            created_at timestamptz DEFAULT now(),
            UNIQUE(user_id, workspace_id)
        );
        GRANT ALL ON public.agent_identity TO authenticated;
        GRANT ALL ON public.agent_identity TO service_role;
        ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage own agent_identity" ON public.agent_identity FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
END $$;

-- Ensure price_table table is solid
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'price_table') THEN
        CREATE TABLE public.price_table (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
            workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
            platform text NOT NULL,
            service text NOT NULL,
            audience text NOT NULL,
            price_per_1000 numeric NOT NULL,
            min_quantity integer NOT NULL,
            max_quantity integer NOT NULL,
            is_active boolean DEFAULT true,
            created_at timestamptz DEFAULT now()
        );
        GRANT ALL ON public.price_table TO authenticated;
        GRANT ALL ON public.price_table TO service_role;
        ALTER TABLE public.price_table ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can manage own price_table" ON public.price_table FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create default workspace for any existing user who doesn't have one
INSERT INTO public.workspaces (user_id, nome, is_default)
SELECT id, 'Meu Workspace', true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.user_id = u.id);

-- Initialize agent_config for any workspace that doesn't have it
INSERT INTO public.agent_config (user_id, workspace_id)
SELECT user_id, id
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.agent_config c WHERE c.workspace_id = w.id);
