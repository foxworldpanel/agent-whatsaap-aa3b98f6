-- 1. CLEANUP: Delete non-Mind workspace and its related data
DO $$
DECLARE
    other_workspace_id UUID := 'a4c51e0c-2c39-486e-882b-032d056dfcfe';
    mind_workspace_id UUID := 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
BEGIN
    -- Delete from tables where data was found
    DELETE FROM public.contact_categories WHERE workspace_id = other_workspace_id;
    DELETE FROM public.contact_lists WHERE workspace_id = other_workspace_id;
    DELETE FROM public.blast_campaigns WHERE workspace_id = other_workspace_id;
    
    -- Delete from other tables (inventory showed 0, but good for safety)
    DELETE FROM public.agent_logs_v2 WHERE workspace_id = other_workspace_id;
    DELETE FROM public.price_table WHERE workspace_id = other_workspace_id;
    DELETE FROM public.contact_groups WHERE workspace_id = other_workspace_id;
    DELETE FROM public.conversations WHERE workspace_id = other_workspace_id;
    DELETE FROM public.whatsapp_numbers WHERE workspace_id = other_workspace_id;
    DELETE FROM public.auto_campaigns WHERE workspace_id = other_workspace_id;
    DELETE FROM public.welcome_funnel_runs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.extraction_logs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.campaign_logs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_v2_turn_analytics WHERE workspace_id = other_workspace_id;
    DELETE FROM public.messages WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_v2_conversation_analytics WHERE workspace_id = other_workspace_id;
    DELETE FROM public.test_numbers WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_modules_v2 WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_modules_v2_history WHERE workspace_id = other_workspace_id;
    DELETE FROM public.contacts WHERE workspace_id = other_workspace_id;
    DELETE FROM public.blast_logs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.forbidden_rules WHERE workspace_id = other_workspace_id;
    DELETE FROM public.panel_guide WHERE workspace_id = other_workspace_id;
    DELETE FROM public.blast_contacts WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_logs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.contact_group_members WHERE workspace_id = other_workspace_id;
    DELETE FROM public.free_trials WHERE workspace_id = other_workspace_id;
    DELETE FROM public.knowledge_base WHERE workspace_id = other_workspace_id;
    DELETE FROM public.opening_templates WHERE workspace_id = other_workspace_id;
    DELETE FROM public.integrations WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_identity WHERE workspace_id = other_workspace_id;
    DELETE FROM public.playlist_sales WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_daily_promo WHERE workspace_id = other_workspace_id;
    DELETE FROM public.prompt_modules WHERE workspace_id = other_workspace_id;
    DELETE FROM public.welcome_funnels WHERE workspace_id = other_workspace_id;
    DELETE FROM public.blast_flows WHERE workspace_id = other_workspace_id;
    DELETE FROM public.free_test_services WHERE workspace_id = other_workspace_id;
    DELETE FROM public.meta_ads_trigger_rules WHERE workspace_id = other_workspace_id;
    DELETE FROM public.agent_config WHERE workspace_id = other_workspace_id;
    DELETE FROM public.catalog_cache WHERE workspace_id = other_workspace_id;
    DELETE FROM public.auto_campaign_runs WHERE workspace_id = other_workspace_id;
    DELETE FROM public.campaigns WHERE workspace_id = other_workspace_id;

    -- 2. ORPHANS: Link records with null workspace_id to Mind
    UPDATE public.agent_logs SET workspace_id = mind_workspace_id WHERE workspace_id IS NULL;

    -- 3. REMOVE WORKSPACE: Finally delete the other workspace
    DELETE FROM public.workspaces WHERE id = other_workspace_id;
END $$;

-- 4. SECURITY: Prevent creation of new workspaces
CREATE OR REPLACE FUNCTION public.check_single_tenant_workspace()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id != 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' THEN
        RAISE EXCEPTION 'This project is single-tenant and only allows the Mind workspace (bd59fa41-d68d-4ac8-b995-e09ae48f52aa).';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_single_tenant_workspace ON public.workspaces;
CREATE TRIGGER trigger_check_single_tenant_workspace
BEFORE INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.check_single_tenant_workspace();

-- 5. RLS: Update policies to enforce the single workspace ID where possible
-- Allow reading the Mind workspace for everyone authenticated
DROP POLICY IF EXISTS "Public read Mind workspace" ON public.workspaces;
CREATE POLICY "Public read Mind workspace"
ON public.workspaces
FOR SELECT
TO authenticated
USING (id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa');
