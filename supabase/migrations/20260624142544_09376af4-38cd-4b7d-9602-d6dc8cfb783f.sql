
CREATE TYPE public.contact_temperatura AS ENUM ('quente','morno','frio','bloqueado');

ALTER TABLE public.contacts
  ADD COLUMN temperatura public.contact_temperatura NOT NULL DEFAULT 'frio',
  ADD COLUMN temperatura_updated_at TIMESTAMPTZ;

CREATE INDEX contacts_user_temperatura_idx ON public.contacts(user_id, temperatura, temperatura_updated_at DESC);
