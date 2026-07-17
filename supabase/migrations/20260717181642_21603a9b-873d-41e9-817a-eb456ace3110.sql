
-- Add check constraint to workspaces to prevent other entries
ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS check_only_mind_workspace;
ALTER TABLE public.workspaces ADD CONSTRAINT check_only_mind_workspace CHECK (id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa');

-- Also check for tables with workspace_id to ensure they only point to Mind
DO $$
DECLARE
    t_name text;
    mind_id uuid := 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
BEGIN
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'workspace_id' 
          AND table_schema = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS check_workspace_is_mind', t_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT check_workspace_is_mind CHECK (workspace_id = %L)', t_name, mind_id);
    END LOOP;
END $$;
