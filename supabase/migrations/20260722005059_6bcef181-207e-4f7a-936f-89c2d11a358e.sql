-- 1. Add workspace_id to conversations_v3
ALTER TABLE public.conversations_v3 
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Backfill workspace_id for existing rows
UPDATE public.conversations_v3 
SET workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' 
WHERE workspace_id IS NULL;

-- Make workspace_id NOT NULL after backfill
ALTER TABLE public.conversations_v3 
ALTER COLUMN workspace_id SET NOT NULL;

-- Update unique constraint to workspace+phone instead of user+phone
ALTER TABLE public.conversations_v3 DROP CONSTRAINT IF EXISTS conversations_v3_user_id_phone_key;
ALTER TABLE public.conversations_v3 ADD CONSTRAINT conversations_v3_workspace_id_phone_key UNIQUE (workspace_id, phone);

-- 2. Update RLS Policies for Single-Tenant Access (Mind SMM Panel)

-- Workspaces
DROP POLICY IF EXISTS "Users can manage their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Authenticated users can see Mind workspace" ON public.workspaces;
CREATE POLICY "Authenticated users can see Mind workspace" 
ON public.workspaces FOR SELECT TO authenticated 
USING (id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid());

-- Agent Modules V3
DROP POLICY IF EXISTS "Users can manage their own modules" ON public.agent_modules_v3;
DROP POLICY IF EXISTS "Authenticated users can manage Mind modules" ON public.agent_modules_v3;
CREATE POLICY "Authenticated users can manage Mind modules" 
ON public.agent_modules_v3 FOR ALL TO authenticated 
USING (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid())
WITH CHECK (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid());

-- WhatsApp Numbers
DROP POLICY IF EXISTS "workspace_scoped" ON public.whatsapp_numbers;
DROP POLICY IF EXISTS "Authenticated users can manage Mind numbers" ON public.whatsapp_numbers;
CREATE POLICY "Authenticated users can manage Mind numbers" 
ON public.whatsapp_numbers FOR ALL TO authenticated 
USING (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid())
WITH CHECK (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid());

-- Conversations V3
DROP POLICY IF EXISTS "Users can view their own v3 conversations" ON public.conversations_v3;
DROP POLICY IF EXISTS "Users can insert their own v3 conversations" ON public.conversations_v3;
DROP POLICY IF EXISTS "Users can update their own v3 conversations" ON public.conversations_v3;
DROP POLICY IF EXISTS "Users can delete their own v3 conversations" ON public.conversations_v3;
DROP POLICY IF EXISTS "Authenticated users can manage Mind conversations" ON public.conversations_v3;

CREATE POLICY "Authenticated users can manage Mind conversations" 
ON public.conversations_v3 FOR ALL TO authenticated 
USING (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid())
WITH CHECK (workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' OR user_id = auth.uid());

-- 3. Grant permissions explicitly
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_modules_v3 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations_v3 TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
GRANT ALL ON public.agent_modules_v3 TO service_role;
GRANT ALL ON public.whatsapp_numbers TO service_role;
GRANT ALL ON public.conversations_v3 TO service_role;
