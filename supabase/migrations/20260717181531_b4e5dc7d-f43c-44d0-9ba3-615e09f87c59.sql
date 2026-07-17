
DO $$
DECLARE
    t_name text;
    mind_id uuid := 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
BEGIN
    -- Delete all other workspaces first
    DELETE FROM public.workspaces WHERE id != mind_id;

    -- Update all tables that have workspace_id column
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'workspace_id' 
          AND table_schema = 'public'
    LOOP
        EXECUTE format('UPDATE public.%I SET workspace_id = %L WHERE workspace_id IS NULL OR workspace_id != %L', t_name, mind_id, mind_id);
    END LOOP;
END $$;
