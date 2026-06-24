CREATE TABLE public.welcome_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Novo funil',
  enabled boolean NOT NULL DEFAULT true,
  delay_seconds int NOT NULL DEFAULT 3,
  trigger_keywords text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_funnels TO authenticated;
GRANT ALL ON public.welcome_funnels TO service_role;

ALTER TABLE public.welcome_funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own welcome_funnels" ON public.welcome_funnels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_welcome_funnels
  BEFORE UPDATE ON public.welcome_funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX welcome_funnels_number_idx ON public.welcome_funnels (whatsapp_number_id, sort_order);
CREATE INDEX welcome_funnels_user_idx ON public.welcome_funnels (user_id);

CREATE TABLE public.welcome_funnel_runs (
  funnel_id uuid NOT NULL REFERENCES public.welcome_funnels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (funnel_id, contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_funnel_runs TO authenticated;
GRANT ALL ON public.welcome_funnel_runs TO service_role;

ALTER TABLE public.welcome_funnel_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own welcome_funnel_runs" ON public.welcome_funnel_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX welcome_funnel_runs_contact_idx ON public.welcome_funnel_runs (contact_id);