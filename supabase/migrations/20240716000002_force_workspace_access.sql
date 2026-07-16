-- Reset RLS for workspaces to ensure absolute access for owners
DROP POLICY IF EXISTS "Users can manage their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.workspaces;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Grant broad but secure access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

-- Simple, non-recursive policy
CREATE POLICY "Users can manage their own workspaces"
ON public.workspaces
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure EVERY existing user has a default workspace right now
DO $$
DECLARE
    u_id UUID;
BEGIN
    FOR u_id IN SELECT id FROM auth.users LOOP
        IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = u_id) THEN
            INSERT INTO public.workspaces (user_id, nome, icone, cor, is_default)
            VALUES (u_id, 'Meu Workspace', '📱', 'blue', true);
        END IF;
    END LOOP;
END
$$;

-- Ensure agent_config and agent_identity have grants (they are used by the page)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_config TO authenticated;
GRANT ALL ON public.agent_config TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_identity TO authenticated;
GRANT ALL ON public.agent_identity TO service_role;

-- Ensure RLS is active on these tables
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;

-- Basic policies for these tables if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_config' AND policyname = 'Users can manage their own config') THEN
        CREATE POLICY "Users can manage their own config" ON public.agent_config FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_identity' AND policyname = 'Users can manage their own identity') THEN
        CREATE POLICY "Users can manage their own identity" ON public.agent_identity FOR ALL TO authenticated USING (auth.uid() = user_id);
    END IF;
END
$$;
