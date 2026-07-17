
-- Drop the generic policy
DROP POLICY IF EXISTS "Users manage own workspaces" ON public.workspaces;

-- Update the read policy to be clear
DROP POLICY IF EXISTS "Public read Mind workspace" ON public.workspaces;
CREATE POLICY "Anyone authenticated can read Mind workspace" 
ON public.workspaces FOR SELECT 
TO authenticated 
USING (id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa');

-- Explicitly deny INSERT/DELETE for authenticated (unless we want to allow the current owner to edit, but user said "remove complexity")
-- By not adding a policy for INSERT/DELETE, it's blocked by default when RLS is enabled.
