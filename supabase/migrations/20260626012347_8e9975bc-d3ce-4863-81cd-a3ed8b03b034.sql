
CREATE TABLE public.auto_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_hours integer NOT NULL DEFAULT 24,
  message_template text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_campaigns TO authenticated;
GRANT ALL ON public.auto_campaigns TO service_role;
ALTER TABLE public.auto_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own auto_campaigns" ON public.auto_campaigns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER auto_campaigns_updated_at BEFORE UPDATE ON public.auto_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.auto_campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_campaign_id uuid NOT NULL REFERENCES public.auto_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  campaign_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error text,
  UNIQUE (contact_id, campaign_key)
);
CREATE INDEX auto_campaign_runs_user_idx ON public.auto_campaign_runs (user_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_campaign_runs TO authenticated;
GRANT ALL ON public.auto_campaign_runs TO service_role;
ALTER TABLE public.auto_campaign_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own auto_campaign_runs" ON public.auto_campaign_runs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;
CREATE INDEX IF NOT EXISTS contacts_user_last_purchase_idx ON public.contacts (user_id, last_purchase_at DESC);
