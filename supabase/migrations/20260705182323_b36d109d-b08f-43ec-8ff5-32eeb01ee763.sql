
-- ============================================================================
-- Fase 2 - Migration F: workspace-scoped RLS (atomic all-or-nothing)
-- ============================================================================
-- Backup of previous policies (for reference/manual rollback):
--   agent_config: "own agent config"
--   agent_identity: "Owner manages identity"
--   agent_logs: "Users manage their own agent logs"
--   auto_campaign_runs: "own auto_campaign_runs"
--   auto_campaigns: "own auto_campaigns"
--   blast_campaigns: "blast_campaigns owner"
--   blast_contacts: "blast_contacts owner"
--   blast_flows: "Users manage their own blast_flows"
--   blast_logs: "blast_logs owner read" + "blast_logs owner insert"
--   campaign_logs: "own logs"
--   campaigns: "own campaigns"
--   catalog_cache: "users manage own catalog_cache"
--   contact_categories: "own categories"
--   contact_group_members: "own contact_group_members"
--   contact_groups: "own contact_groups"
--   contact_lists: "owner manages contact_lists"
--   contacts: "own contacts"
--   conversations: "own conversations"
--   extraction_logs: "Users manage own extraction logs"
--   forbidden_rules: "Users manage own forbidden_rules"
--   free_test_services: "fts_owner_all"
--   free_trials: "Users manage their own free trials"
--   integrations: "own integrations"
--   knowledge_base: "kb_owner_all"
--   messages: "own messages"
--   opening_templates: "own opening_templates"
--   panel_guide: "Users manage own panel guide"
--   prompt_modules: "Users manage own prompt_modules"
--   test_numbers: "Users manage own test numbers"
--   welcome_funnel_runs: "own welcome_funnel_runs"
--   welcome_funnels: "own welcome_funnels"
--   whatsapp_numbers: "own whatsapp_numbers"
-- All were: USING/WITH CHECK (auth.uid() = user_id)
-- Restore = re-create with same body.
-- ============================================================================

-- 1. Update trigger: prefer session var (app.workspace_id) set by middleware,
--    fall back to user's default workspace if not set (webhook / cron).
CREATE OR REPLACE FUNCTION public.set_default_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_ws text;
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    session_ws := current_setting('app.workspace_id', true);
    IF session_ws IS NOT NULL AND session_ws <> '' THEN
      BEGIN
        NEW.workspace_id := session_ws::uuid;
      EXCEPTION WHEN others THEN
        session_ws := NULL;
      END;
    END IF;

    IF NEW.workspace_id IS NULL THEN
      SELECT id INTO NEW.workspace_id
      FROM public.workspaces
      WHERE user_id = NEW.user_id AND is_default = true
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Drop all old policies + create workspace-scoped policy on every target table.
--    Single DO block = single transaction; any error aborts everything.
DO $$
DECLARE
  tbls text[] := ARRAY[
    'agent_config','agent_identity','agent_logs','auto_campaign_runs','auto_campaigns',
    'blast_campaigns','blast_contacts','blast_flows','blast_logs','campaign_logs',
    'campaigns','catalog_cache','contact_categories','contact_group_members','contact_groups',
    'contact_lists','contacts','conversations','extraction_logs','forbidden_rules',
    'free_test_services','free_trials','integrations','knowledge_base','messages',
    'opening_templates','panel_guide','prompt_modules','test_numbers','welcome_funnel_runs',
    'welcome_funnels','whatsapp_numbers'
  ];
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Drop every existing policy on this table
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Create the new workspace-scoped policy.
    -- USING (read/update/delete visibility): filters by active workspace when session var is set,
    --   otherwise shows all workspaces the user owns (safe fallback for pre-Fase2 clients).
    -- WITH CHECK (insert/update): always requires the workspace to belong to the user.
    EXECUTE format(
      'CREATE POLICY "workspace_scoped" ON public.%I FOR ALL TO authenticated '
      'USING ('
      '  auth.uid() = user_id '
      '  AND public.user_owns_workspace(workspace_id) '
      '  AND ('
      '    NULLIF(current_setting(''app.workspace_id'', true), '''') IS NULL '
      '    OR workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid'
      '  )'
      ') '
      'WITH CHECK ('
      '  auth.uid() = user_id '
      '  AND public.user_owns_workspace(workspace_id)'
      ')',
      t
    );
  END LOOP;
END $$;
