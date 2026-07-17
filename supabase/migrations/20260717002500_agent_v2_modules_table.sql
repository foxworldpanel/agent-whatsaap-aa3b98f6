-- Create table for agent modules V2 configuration
CREATE TABLE public.agent_modules_v2 (
    id TEXT PRIMARY KEY,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    emoji TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Normal',
    category TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    modes TEXT[] NOT NULL DEFAULT '{all}',
    dependencies TEXT[] NOT NULL DEFAULT '{}',
    is_core BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(workspace_id, id)
);

-- Versioning table
CREATE TABLE public.agent_modules_v2_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.agent_modules_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_modules_v2_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v2 TO authenticated;
GRANT ALL ON public.agent_modules_v2 TO service_role;

GRANT SELECT, INSERT ON public.agent_modules_v2_history TO authenticated;
GRANT ALL ON public.agent_modules_v2_history TO service_role;

CREATE POLICY "Users can manage their own workspace modules" 
ON public.agent_modules_v2 
FOR ALL 
TO authenticated 
USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

CREATE POLICY "Users can view history of their workspace modules" 
ON public.agent_modules_v2_history 
FOR SELECT 
TO authenticated 
USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

-- Insert seed data for a specific workspace if needed? 
-- No, we should migrate the hardcoded data to the table for the current workspace in a server function or during first load.
-- But for "Mind" workspace we can seed it now.

INSERT INTO public.agent_modules_v2 (id, workspace_id, user_id, title, emoji, description, content, priority, category, is_core, modes)
VALUES 
('mission', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', '09f4dee9-0a1b-4c43-b083-75cc64feb99d', 'Missão', '🚀', 'Objetivo fundamental e restrições de venda do agente.', '', 'Alta', 'Core', true, '{all}'),
('identity', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', '09f4dee9-0a1b-4c43-b083-75cc64feb99d', 'Identidade', '🪪', 'Persona da Júlia, tom de voz e estilo de escrita.', '', 'Alta', 'Core', true, '{all}'),
('guards', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', '09f4dee9-0a1b-4c43-b083-75cc64feb99d', 'Guardas', '🚫', 'Regras de segurança e integridade absoluta.', '', 'Alta', 'Core', true, '{all}');
-- Add others if needed or handle via server function migration.
