
-- Forward-only migration: remove hardcoded workspace UUID bypasses in RLS
-- Keeps RLS enabled. Ownership is enforced via auth.uid() and workspaces.user_id.

-- =========================
-- workspaces
-- =========================
DROP POLICY IF EXISTS "Authenticated users can see Mind workspace" ON public.workspaces;
-- keep "Workspace owner can read own workspace"

-- =========================
-- contacts
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind contacts" ON public.contacts;
CREATE POLICY "Users manage own contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- conversations
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind conversations" ON public.conversations;
CREATE POLICY "Users manage own conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- conversations_v3
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind conversations" ON public.conversations_v3;
CREATE POLICY "Users manage own conversations_v3" ON public.conversations_v3
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      workspace_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = conversations_v3.workspace_id AND w.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      workspace_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = conversations_v3.workspace_id AND w.user_id = auth.uid()
      )
    )
  );
-- keep "Service role can do everything"

-- =========================
-- messages
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind messages" ON public.messages;
CREATE POLICY "Users manage own messages" ON public.messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- whatsapp_numbers (contains uazapi tokens — strict ownership)
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind numbers" ON public.whatsapp_numbers;
CREATE POLICY "Users manage own whatsapp_numbers" ON public.whatsapp_numbers
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- blast_campaigns
-- =========================
DROP POLICY IF EXISTS "mind_authenticated_all" ON public.blast_campaigns;
CREATE POLICY "Users manage own blast_campaigns" ON public.blast_campaigns
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- agent_modules_v3
-- =========================
DROP POLICY IF EXISTS "Authenticated users can manage Mind modules" ON public.agent_modules_v3;
CREATE POLICY "Users manage own agent_modules_v3" ON public.agent_modules_v3
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      workspace_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = agent_modules_v3.workspace_id AND w.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      workspace_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = agent_modules_v3.workspace_id AND w.user_id = auth.uid()
      )
    )
  );
