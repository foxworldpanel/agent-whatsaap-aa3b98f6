
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_pause_on_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS last_risk_check_at timestamptz;
