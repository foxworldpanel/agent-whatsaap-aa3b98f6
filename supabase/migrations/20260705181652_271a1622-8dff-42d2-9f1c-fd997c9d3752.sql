
-- Trigger function: fills workspace_id with user's default workspace when NULL
CREATE OR REPLACE FUNCTION public.set_default_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.workspace_id
    FROM public.workspaces
    WHERE user_id = NEW.user_id AND is_default = true
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger + NOT NULL + index to every table
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
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('CREATE TRIGGER %I_set_default_workspace BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_default_workspace_id()', t, t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX %I_workspace_id_idx ON public.%I(workspace_id)', t, t);
  END LOOP;
END $$;
