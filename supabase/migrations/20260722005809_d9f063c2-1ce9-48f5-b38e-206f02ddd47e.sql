-- Update RLS policies for contacts, conversations, and messages to allow Mind workspace access for all authenticated users.
-- This ensures multi-admin visibility in the single-tenant setup.

-- 1. contacts
DROP POLICY IF EXISTS "workspace_scoped" ON public.contacts;
CREATE POLICY "Authenticated users can manage Mind contacts"
ON public.contacts
FOR ALL
TO authenticated
USING (
  (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid) OR 
  (user_id = auth.uid())
);

-- 2. conversations
DROP POLICY IF EXISTS "workspace_scoped" ON public.conversations;
CREATE POLICY "Authenticated users can manage Mind conversations"
ON public.conversations
FOR ALL
TO authenticated
USING (
  (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid) OR 
  (user_id = auth.uid())
);

-- 3. messages
DROP POLICY IF EXISTS "workspace_scoped" ON public.messages;
CREATE POLICY "Authenticated users can manage Mind messages"
ON public.messages
FOR ALL
TO authenticated
USING (
  (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'::uuid) OR 
  (user_id = auth.uid())
);

-- Ensure GRANTS are correct
GRANT ALL ON public.contacts TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.contacts TO service_role;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;