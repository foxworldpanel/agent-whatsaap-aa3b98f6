ALTER TABLE public.integrations
  DROP COLUMN IF EXISTS evolution_url,
  DROP COLUMN IF EXISTS evolution_api_key,
  DROP COLUMN IF EXISTS evolution_instance,
  ADD COLUMN IF NOT EXISTS uazapi_url text,
  ADD COLUMN IF NOT EXISTS uazapi_token text,
  ADD COLUMN IF NOT EXISTS uazapi_admin_token text;
CREATE INDEX IF NOT EXISTS integrations_uazapi_token_idx ON public.integrations (uazapi_token);