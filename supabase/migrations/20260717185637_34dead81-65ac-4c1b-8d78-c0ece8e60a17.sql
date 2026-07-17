
-- 1. Fix user_owns_workspace: real ownership check
CREATE OR REPLACE FUNCTION public.user_owns_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id
      AND user_id = auth.uid()
  );
$$;

-- 2. Fix effective_workspace_id: return the caller's actual workspace
CREATE OR REPLACE FUNCTION public.effective_workspace_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.workspaces
  WHERE user_id = _user_id
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;
$$;

-- 3. Add fixed search_path to check_single_tenant_workspace (mutable search_path finding)
CREATE OR REPLACE FUNCTION public.check_single_tenant_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.id != 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' THEN
        RAISE EXCEPTION 'This project is single-tenant and only allows the Mind workspace (bd59fa41-d68d-4ac8-b995-e09ae48f52aa).';
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Revoke EXECUTE from PUBLIC/anon on all SECURITY DEFINER functions in public.
--    Trigger functions do not require caller EXECUTE. RLS helpers only need
--    authenticated + service_role.
REVOKE EXECUTE ON FUNCTION public.user_owns_workspace(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_workspace_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_default_workspace_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_agent_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(text, uuid, text, text, text, text, text, text, integer, integer, numeric, integer, text, jsonb, text, text[], text[], text[], text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_owns_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_workspace_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_agent_v2_turn_analytics(text, uuid, text, text, text, text, text, text, integer, integer, numeric, integer, text, jsonb, text, text[], text[], text[], text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_conversation(uuid, uuid, uuid, conversation_status, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_prompt_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_agent_v2_analytics() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_agent_logs() TO service_role;

-- 5. Restrict workspaces read policy to the actual owner
DROP POLICY IF EXISTS "Anyone authenticated can read Mind workspace" ON public.workspaces;
CREATE POLICY "Workspace owner can read own workspace"
ON public.workspaces
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
