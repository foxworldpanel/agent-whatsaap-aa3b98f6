-- Sistema de listas de contatos: Lista A (Meta Ads) e Lista B (Instagram)

CREATE TABLE IF NOT EXISTS public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('meta_ads','instagram')),
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, origem)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages contact_lists"
ON public.contact_lists FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER contact_lists_updated_at
BEFORE UPDATE ON public.contact_lists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- blast_contacts: vincular à lista; campaign_id passa a ser opcional (contato vive na lista, campanha consome a lista)
ALTER TABLE public.blast_contacts
  ADD COLUMN IF NOT EXISTS contact_list_id uuid REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS origem text;

ALTER TABLE public.blast_contacts ALTER COLUMN campaign_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS blast_contacts_list_idx ON public.blast_contacts(contact_list_id, status);
CREATE INDEX IF NOT EXISTS blast_contacts_user_phone_idx ON public.blast_contacts(user_id, telefone);

-- blast_campaigns: vincular à lista que consome
ALTER TABLE public.blast_campaigns
  ADD COLUMN IF NOT EXISTS contact_list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL;

-- Backfill: criar Lista A e Lista B para cada user com dados existentes; mover blast_contacts atuais para Lista B (instagram)
DO $$
DECLARE
  u uuid;
  list_a uuid;
  list_b uuid;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM public.blast_contacts
    UNION
    SELECT DISTINCT user_id FROM public.blast_campaigns
  LOOP
    INSERT INTO public.contact_lists(user_id, name, origem)
    VALUES (u, 'Lista A — Meta Ads', 'meta_ads')
    ON CONFLICT (user_id, origem) DO NOTHING
    RETURNING id INTO list_a;
    IF list_a IS NULL THEN
      SELECT id INTO list_a FROM public.contact_lists WHERE user_id=u AND origem='meta_ads';
    END IF;

    INSERT INTO public.contact_lists(user_id, name, origem)
    VALUES (u, 'Lista B — Instagram', 'instagram')
    ON CONFLICT (user_id, origem) DO NOTHING
    RETURNING id INTO list_b;
    IF list_b IS NULL THEN
      SELECT id INTO list_b FROM public.contact_lists WHERE user_id=u AND origem='instagram';
    END IF;

    UPDATE public.blast_contacts
      SET contact_list_id = list_b, origem = 'instagram'
    WHERE user_id = u AND contact_list_id IS NULL;

    UPDATE public.blast_campaigns
      SET contact_list_id = list_b
    WHERE user_id = u AND contact_list_id IS NULL;
  END LOOP;
END$$;
