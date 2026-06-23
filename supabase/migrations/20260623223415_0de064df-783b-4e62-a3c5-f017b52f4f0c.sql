ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'organico',
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_headline text,
  ADD COLUMN IF NOT EXISTS source_data jsonb;

CREATE INDEX IF NOT EXISTS contacts_user_source_idx ON public.contacts (user_id, source);

COMMENT ON COLUMN public.contacts.source IS 'Origem do lead: meta_ads, organico, importado, manual, etc.';
COMMENT ON COLUMN public.contacts.source_ref IS 'ID do click/ref (ex: ctwa_clid, ref do Meta Ads).';
COMMENT ON COLUMN public.contacts.source_url IS 'URL do anúncio ou origem.';
COMMENT ON COLUMN public.contacts.source_headline IS 'Texto/headline do anúncio quando disponível.';
COMMENT ON COLUMN public.contacts.source_data IS 'Payload bruto de referral para auditoria.';