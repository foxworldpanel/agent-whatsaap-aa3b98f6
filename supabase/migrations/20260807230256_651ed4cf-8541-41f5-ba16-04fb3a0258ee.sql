
-- 1. Recriar a tabela de histórico com o schema CORRETO (bater com agent_modules_v3)
-- Como a tabela existente está muito divergente, vamos renomeá-la para backup e criar a nova.
ALTER TABLE public.agent_modules_v3_history RENAME TO agent_modules_v3_history_old;

CREATE TABLE public.agent_modules_v3_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  content TEXT NOT NULL,
  enabled BOOLEAN,
  priority INTEGER,
  version INTEGER,
  always_load BOOLEAN,
  selector_intents TEXT[],
  selector_stages TEXT[],
  selector_platforms TEXT[],
  selector_products TEXT[],
  selector_triggers TEXT[],
  selector_dependencies TEXT[],
  selector_conflicts TEXT[],
  domain TEXT,
  platform TEXT,
  knowledge_type TEXT,
  status TEXT,
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Garantir privilégios
GRANT SELECT ON public.agent_modules_v3_history TO authenticated;
GRANT ALL ON public.agent_modules_v3_history TO service_role;

-- 3. Habilitar RLS
ALTER TABLE public.agent_modules_v3_history ENABLE ROW LEVEL SECURITY;

-- 4. Política de Acesso (User isolation)
CREATE POLICY "Users can view history of their own modules"
  ON public.agent_modules_v3_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Função de Auditoria
CREATE OR REPLACE FUNCTION public.log_agent_modules_v3_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.agent_modules_v3_history (
    module_id, user_id, workspace_id, key, name, description, category,
    content, enabled, priority, version, always_load,
    selector_intents, selector_stages, selector_platforms,
    selector_products, selector_triggers, selector_dependencies,
    selector_conflicts, domain, platform, knowledge_type, status,
    original_created_at, original_updated_at
  ) VALUES (
    OLD.id, OLD.user_id, OLD.workspace_id, OLD.key, OLD.name, OLD.description, OLD.category,
    OLD.content, OLD.enabled, OLD.priority, OLD.version, OLD.always_load,
    OLD.selector_intents, OLD.selector_stages, OLD.selector_platforms,
    OLD.selector_products, OLD.selector_triggers, OLD.selector_dependencies,
    OLD.selector_conflicts, OLD.domain, OLD.platform, OLD.knowledge_type, OLD.status,
    OLD.created_at, OLD.updated_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Trigger
DROP TRIGGER IF EXISTS trg_agent_modules_v3_history ON public.agent_modules_v3;
CREATE TRIGGER trg_agent_modules_v3_history
  BEFORE UPDATE ON public.agent_modules_v3
  FOR EACH ROW
  EXECUTE FUNCTION public.log_agent_modules_v3_history();
