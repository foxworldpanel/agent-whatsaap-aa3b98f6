
CREATE TABLE public.contact_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT 'blue',
  icone text NOT NULL DEFAULT '📣',
  slug text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_categories TO authenticated;
GRANT ALL ON public.contact_categories TO service_role;
ALTER TABLE public.contact_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.contact_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_contact_categories_updated_at
  BEFORE UPDATE ON public.contact_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.blast_contacts
  ADD COLUMN categoria_id uuid REFERENCES public.contact_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_blast_contacts_categoria ON public.blast_contacts(categoria_id);

-- Seed 2 categorias default para todos os usuários existentes
INSERT INTO public.contact_categories (user_id, nome, cor, icone, slug, is_system)
SELECT id, 'Meta Ads',        'blue', '📣', 'meta_ads',        true FROM auth.users
ON CONFLICT (user_id, slug) DO NOTHING;
INSERT INTO public.contact_categories (user_id, nome, cor, icone, slug, is_system)
SELECT id, 'Lead Instagram',  'pink', '📷', 'lead_instagram',  true FROM auth.users
ON CONFLICT (user_id, slug) DO NOTHING;

-- Backfill: contatos existentes com origem meta_ads viram Meta Ads
UPDATE public.blast_contacts bc
SET categoria_id = cc.id
FROM public.contact_categories cc
WHERE cc.user_id = bc.user_id AND cc.slug = 'meta_ads' AND bc.origem = 'meta_ads' AND bc.categoria_id IS NULL;

-- Backfill: os demais viram Lead Instagram
UPDATE public.blast_contacts bc
SET categoria_id = cc.id
FROM public.contact_categories cc
WHERE cc.user_id = bc.user_id AND cc.slug = 'lead_instagram' AND bc.categoria_id IS NULL;

-- Trigger: quando um novo user for criado, cria as categorias default
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contact_categories (user_id, nome, cor, icone, slug, is_system)
  VALUES
    (NEW.id, 'Meta Ads',       'blue', '📣', 'meta_ads',       true),
    (NEW.id, 'Lead Instagram', 'pink', '📷', 'lead_instagram', true)
  ON CONFLICT (user_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_default_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();
