
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
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id DROP NOT NULL', t);
  END LOOP;
END $$;
