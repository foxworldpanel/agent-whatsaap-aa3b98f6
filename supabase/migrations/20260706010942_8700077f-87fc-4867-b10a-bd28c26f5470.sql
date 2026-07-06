ALTER TABLE public.catalog_cache ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS catalog_cache_hidden_idx ON public.catalog_cache (workspace_id, hidden);