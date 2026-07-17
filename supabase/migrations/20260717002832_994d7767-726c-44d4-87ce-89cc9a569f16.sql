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
