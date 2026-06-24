
CREATE TABLE public.whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  uazapi_url text,
  uazapi_token text,
  uazapi_admin_token text,
  status text NOT NULL DEFAULT 'desconectado',
  meta_ads_enabled boolean NOT NULL DEFAULT false,
  disparos_mode boolean NOT NULL DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_numbers TO authenticated;
GRANT ALL ON public.whatsapp_numbers TO service_role;

ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own whatsapp_numbers" ON public.whatsapp_numbers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX whatsapp_numbers_user_idx ON public.whatsapp_numbers(user_id);
CREATE INDEX whatsapp_numbers_token_idx ON public.whatsapp_numbers(uazapi_token);

CREATE TRIGGER whatsapp_numbers_updated_at BEFORE UPDATE ON public.whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_numbers;

-- Vínculo nas conversas e contatos
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_number_idx ON public.conversations(whatsapp_number_id);
CREATE INDEX IF NOT EXISTS contacts_number_idx ON public.contacts(whatsapp_number_id);

-- Migra a integração atual de cada usuário para um número "Principal"
INSERT INTO public.whatsapp_numbers (user_id, nome, uazapi_url, uazapi_token, uazapi_admin_token, status)
SELECT i.user_id, 'Principal', i.uazapi_url, i.uazapi_token, i.uazapi_admin_token,
  CASE WHEN i.uazapi_token IS NOT NULL AND i.uazapi_token <> '' THEN 'conectado' ELSE 'desconectado' END
FROM public.integrations i
WHERE i.uazapi_token IS NOT NULL AND i.uazapi_token <> ''
ON CONFLICT DO NOTHING;

-- Vincula conversas e contatos existentes ao número "Principal" do usuário
UPDATE public.conversations c
SET whatsapp_number_id = n.id
FROM public.whatsapp_numbers n
WHERE c.whatsapp_number_id IS NULL
  AND n.user_id = c.user_id
  AND n.nome = 'Principal';

UPDATE public.contacts c
SET whatsapp_number_id = n.id
FROM public.whatsapp_numbers n
WHERE c.whatsapp_number_id IS NULL
  AND n.user_id = c.user_id
  AND n.nome = 'Principal';
