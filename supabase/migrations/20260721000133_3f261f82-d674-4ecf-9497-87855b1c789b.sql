CREATE TABLE public.agent_modules_v3 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'Outros',
    content text NOT NULL,
    enabled boolean DEFAULT true,
    priority integer DEFAULT 0,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (workspace_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v3 TO authenticated;
GRANT ALL ON public.agent_modules_v3 TO service_role;

ALTER TABLE public.agent_modules_v3 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own modules"
ON public.agent_modules_v3
FOR ALL
TO authenticated
USING (
    workspace_id IN (
        SELECT id FROM public.workspaces WHERE user_id = auth.uid()
    )
);

CREATE INDEX idx_agent_modules_v3_workspace_id ON public.agent_modules_v3(workspace_id);
CREATE INDEX idx_agent_modules_v3_key ON public.agent_modules_v3(key);

CREATE TABLE public.agent_modules_v3_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id uuid REFERENCES public.agent_modules_v3(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    version integer NOT NULL,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.agent_modules_v3_history TO authenticated;
GRANT ALL ON public.agent_modules_v3_history TO service_role;

ALTER TABLE public.agent_modules_v3_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of their modules"
ON public.agent_modules_v3_history
FOR SELECT
TO authenticated
USING (
    module_id IN (
        SELECT id FROM public.agent_modules_v3 WHERE workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
    )
);
