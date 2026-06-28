-- Catálogo SMM em cache (sincronizado manualmente)
CREATE TABLE public.catalog_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  service_id text NOT NULL,
  nome text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  preco_por_1000 numeric NOT NULL DEFAULT 0,
  minimo integer NOT NULL DEFAULT 0,
  maximo integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_cache TO authenticated;
GRANT ALL ON public.catalog_cache TO service_role;

ALTER TABLE public.catalog_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own catalog_cache"
  ON public.catalog_cache FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX catalog_cache_user_idx ON public.catalog_cache(user_id);

CREATE TRIGGER set_catalog_cache_updated_at
  BEFORE UPDATE ON public.catalog_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Toggles do agente: incluir catálogo no prompt e filtrar só serviços relevantes
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS catalog_in_prompt boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalog_only_relevant boolean NOT NULL DEFAULT true;