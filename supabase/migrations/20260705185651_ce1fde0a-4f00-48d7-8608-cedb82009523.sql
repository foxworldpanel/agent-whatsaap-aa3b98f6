
-- Fase 2.5: Isolamento real de workspace
-- 1) Helper que lê o header x-workspace-id enviado pelo cliente via PostgREST

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hdrs text;
  raw text;
BEGIN
  BEGIN
    hdrs := current_setting('request.headers', true);
  EXCEPTION WHEN others THEN
    hdrs := NULL;
  END;
  IF hdrs IS NULL OR hdrs = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    raw := (hdrs::json ->> 'x-workspace-id');
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- Resolve o workspace efetivo: header, senão default do usuário
CREATE OR REPLACE FUNCTION public.effective_workspace_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_workspace_id(),
    (SELECT id FROM public.workspaces WHERE user_id = _user_id AND is_default = true LIMIT 1)
  );
$$;

-- 2) Trigger set_default_workspace_id passa a preferir header
CREATE OR REPLACE FUNCTION public.set_default_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    ws := public.current_workspace_id();
    IF ws IS NULL THEN
      SELECT id INTO ws FROM public.workspaces
        WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
    END IF;
    NEW.workspace_id := ws;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) PKs compostas para tabelas 1-linha-por-usuario
ALTER TABLE public.agent_identity DROP CONSTRAINT IF EXISTS agent_identity_pkey;
ALTER TABLE public.agent_identity ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.agent_identity ADD CONSTRAINT agent_identity_pkey PRIMARY KEY (user_id, workspace_id);

ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_pkey;
ALTER TABLE public.agent_config ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_pkey PRIMARY KEY (user_id, workspace_id);

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_pkey;
ALTER TABLE public.integrations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY (user_id, workspace_id);

-- 4) Uniques por workspace
ALTER TABLE public.contact_categories DROP CONSTRAINT IF EXISTS contact_categories_user_id_slug_key;
ALTER TABLE public.contact_categories ADD CONSTRAINT contact_categories_user_id_workspace_id_slug_key UNIQUE (user_id, workspace_id, slug);

ALTER TABLE public.free_test_services DROP CONSTRAINT IF EXISTS free_test_services_user_id_service_id_key;
ALTER TABLE public.free_test_services ADD CONSTRAINT free_test_services_user_id_workspace_id_service_id_key UNIQUE (user_id, workspace_id, service_id);

-- 5) Reescrever policy workspace_scoped em TODAS as tabelas, usando header via request.headers.
--    Modo: header presente -> filtra estrito por workspace_id. Header ausente -> aceita default do usuário.
DO $$
DECLARE
  t text;
  ws_tables text[] := ARRAY[
    'agent_config','agent_identity','agent_logs','auto_campaign_runs','auto_campaigns',
    'blast_campaigns','blast_contacts','blast_flows','blast_logs','campaign_logs',
    'campaigns','catalog_cache','contact_categories','contact_group_members','contact_groups',
    'contact_lists','contacts','conversations','extraction_logs','forbidden_rules',
    'free_test_services','free_trials','integrations','knowledge_base','messages',
    'opening_templates','panel_guide','prompt_modules','test_numbers','welcome_funnel_runs',
    'welcome_funnels','whatsapp_numbers'
  ];
BEGIN
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS workspace_scoped ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY workspace_scoped ON public.%I
      FOR ALL TO authenticated
      USING (
        auth.uid() = user_id
        AND public.user_owns_workspace(workspace_id)
        AND workspace_id = public.effective_workspace_id(auth.uid())
      )
      WITH CHECK (
        auth.uid() = user_id
        AND public.user_owns_workspace(workspace_id)
        AND workspace_id = public.effective_workspace_id(auth.uid())
      );
    $f$, t);
  END LOOP;
END $$;
