ALTER TABLE public.whatsapp_numbers
ADD COLUMN IF NOT EXISTS welcome_funnel jsonb NOT NULL DEFAULT '{}'::jsonb;