ALTER TABLE public.opening_templates
  ADD COLUMN IF NOT EXISTS templates_en jsonb,
  ADD COLUMN IF NOT EXISTS templates_es jsonb,
  ADD COLUMN IF NOT EXISTS ddi_language_map jsonb;