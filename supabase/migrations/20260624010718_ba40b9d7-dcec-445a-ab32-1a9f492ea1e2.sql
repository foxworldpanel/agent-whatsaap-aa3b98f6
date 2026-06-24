-- Free trials table for MIND SMM Panel integration
CREATE TABLE public.free_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  telefone TEXT NOT NULL,
  link_enviado TEXT NOT NULL,
  order_id TEXT,
  servico TEXT,
  quantidade INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TIMESTAMPTZ,
  notified_completed BOOLEAN NOT NULL DEFAULT false,
  upsell_offered BOOLEAN NOT NULL DEFAULT false,
  raw_response JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, telefone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_trials TO authenticated;
GRANT ALL ON public.free_trials TO service_role;

ALTER TABLE public.free_trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own free trials"
  ON public.free_trials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_free_trials_updated_at
  BEFORE UPDATE ON public.free_trials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX free_trials_pending_idx ON public.free_trials (status) WHERE status NOT IN ('completed','failed','timeout');

-- Add SMM panel config columns to integrations
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS smm_api_key TEXT,
  ADD COLUMN IF NOT EXISTS smm_service_id TEXT,
  ADD COLUMN IF NOT EXISTS smm_panel_url TEXT DEFAULT 'https://mindsmmpanel.com/smmpanel/api/v1',
  ADD COLUMN IF NOT EXISTS free_trial_enabled BOOLEAN NOT NULL DEFAULT true;