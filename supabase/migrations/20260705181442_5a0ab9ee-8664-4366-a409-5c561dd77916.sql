
-- Migration A: workspaces table + seed + security helper

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  icone text NOT NULL DEFAULT '📱',
  cor text NOT NULL DEFAULT 'blue',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one default workspace per user
CREATE UNIQUE INDEX workspaces_one_default_per_user
  ON public.workspaces(user_id) WHERE is_default = true;

CREATE INDEX workspaces_user_id_idx ON public.workspaces(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workspaces"
  ON public.workspaces
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger (reuses existing set_updated_at)
CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Security-definer helper for cross-table RLS in later migrations
CREATE OR REPLACE FUNCTION public.user_owns_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_workspace(uuid) TO authenticated, service_role;

-- Seed: create "Mind SMM Panel" default workspace for every user that already has data
INSERT INTO public.workspaces (user_id, nome, icone, cor, is_default)
SELECT DISTINCT u_id, 'Mind SMM Panel', '📱', 'blue', true
FROM (
  SELECT user_id AS u_id FROM public.agent_identity
  UNION SELECT user_id FROM public.whatsapp_numbers
  UNION SELECT user_id FROM public.contacts
  UNION SELECT user_id FROM public.agent_config
) s
WHERE u_id IS NOT NULL;
