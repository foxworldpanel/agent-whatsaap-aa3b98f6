-- Card "Promoção do Dia" — texto livre + toggle + validade opcional,
-- workspace-scoped (mesmo padrão de agent_config: PK composta user_id+workspace_id).
CREATE TABLE public.agent_daily_promo (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  promo_text text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT false,
  expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_daily_promo TO authenticated;
GRANT ALL ON public.agent_daily_promo TO service_role;

ALTER TABLE public.agent_daily_promo ENABLE ROW LEVEL SECURITY;

-- Mesma policy workspace_scoped usada nas outras tabelas (header x-workspace-id
-- via effective_workspace_id — ver 20260705185651).
CREATE POLICY workspace_scoped ON public.agent_daily_promo
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

CREATE TRIGGER agent_daily_promo_set_updated_at
  BEFORE UPDATE ON public.agent_daily_promo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX agent_daily_promo_user_workspace_idx
  ON public.agent_daily_promo(user_id, workspace_id);

-- Popula a promoção de hoje em TODOS os workspaces existentes.
-- Ativa: "1000 seguidores TikTok Global - R$10,00 com reposição por 30 dias".
INSERT INTO public.agent_daily_promo (user_id, workspace_id, promo_text, active, expires_at)
SELECT w.user_id, w.id,
       '1000 seguidores TikTok Global - R$ 10,00 com reposição por 30 dias',
       true,
       NULL
FROM public.workspaces w
ON CONFLICT (user_id, workspace_id) DO NOTHING;
