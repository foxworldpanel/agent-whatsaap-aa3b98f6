-- Tabela de regras de auto-categorização de leads Meta Ads.
-- Cada regra: um trecho de texto (case-insensitive) que, se aparecer na
-- primeira mensagem do lead, atribui automaticamente a categoria dada.
-- Editável pelo usuário (workspace-scoped).
CREATE TABLE public.meta_ads_trigger_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  category_nome TEXT NOT NULL,
  category_cor TEXT NOT NULL DEFAULT 'blue',
  category_icone TEXT NOT NULL DEFAULT '📣',
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, pattern, category_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads_trigger_rules TO authenticated;
GRANT ALL ON public.meta_ads_trigger_rules TO service_role;

ALTER TABLE public.meta_ads_trigger_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_scoped" ON public.meta_ads_trigger_rules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND user_owns_workspace(workspace_id) AND workspace_id = effective_workspace_id(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND user_owns_workspace(workspace_id) AND workspace_id = effective_workspace_id(auth.uid()));

CREATE TRIGGER meta_ads_trigger_rules_set_default_workspace
  BEFORE INSERT ON public.meta_ads_trigger_rules
  FOR EACH ROW EXECUTE FUNCTION set_default_workspace_id();

CREATE TRIGGER trg_meta_ads_trigger_rules_updated_at
  BEFORE UPDATE ON public.meta_ads_trigger_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX meta_ads_trigger_rules_user_workspace_idx
  ON public.meta_ads_trigger_rules(user_id, workspace_id, active, priority DESC);

-- Seed regras iniciais pra todos os workspaces existentes (Spotify + YouTube).
INSERT INTO public.meta_ads_trigger_rules (user_id, workspace_id, pattern, category_slug, category_nome, category_cor, category_icone, priority)
SELECT w.user_id, w.id, 'divulgar minha música', 'meta_ads_spotify', 'Meta Ads - Spotify', 'green', '🎵', 200
FROM public.workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO public.meta_ads_trigger_rules (user_id, workspace_id, pattern, category_slug, category_nome, category_cor, category_icone, priority)
SELECT w.user_id, w.id, 'spotify', 'meta_ads_spotify', 'Meta Ads - Spotify', 'green', '🎵', 190
FROM public.workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO public.meta_ads_trigger_rules (user_id, workspace_id, pattern, category_slug, category_nome, category_cor, category_icone, priority)
SELECT w.user_id, w.id, 'impulsionar meus vídeos', 'meta_ads_youtube', 'Meta Ads - YouTube', 'red', '📺', 200
FROM public.workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO public.meta_ads_trigger_rules (user_id, workspace_id, pattern, category_slug, category_nome, category_cor, category_icone, priority)
SELECT w.user_id, w.id, 'youtube', 'meta_ads_youtube', 'Meta Ads - YouTube', 'red', '📺', 190
FROM public.workspaces w
ON CONFLICT DO NOTHING;