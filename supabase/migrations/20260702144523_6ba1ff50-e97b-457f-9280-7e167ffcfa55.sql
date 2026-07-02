
-- Extend status enum
ALTER TYPE public.contact_status ADD VALUE IF NOT EXISTS 'abordado_aguardando';
ALTER TYPE public.contact_status ADD VALUE IF NOT EXISTS 'proposta_enviada';
ALTER TYPE public.contact_status ADD VALUE IF NOT EXISTS 'comprou';
ALTER TYPE public.contact_status ADD VALUE IF NOT EXISTS 'perdido';

-- Add instagram field
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram text;

-- Contact groups (custom lists in CRM)
CREATE TABLE IF NOT EXISTS public.contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT ALL ON public.contact_groups TO service_role;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contact_groups" ON public.contact_groups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_contact_groups_updated_at BEFORE UPDATE ON public.contact_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.contact_group_members (
  group_id uuid NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_group_members TO authenticated;
GRANT ALL ON public.contact_group_members TO service_role;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contact_group_members" ON public.contact_group_members FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_cgm_contact ON public.contact_group_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_cgm_group ON public.contact_group_members(group_id);
