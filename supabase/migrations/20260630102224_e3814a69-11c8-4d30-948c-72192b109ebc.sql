
CREATE TABLE public.blast_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  whatsapp_number_id UUID REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '20:00',
  daily_limit INT NOT NULL DEFAULT 200,
  delay_min_sec INT NOT NULL DEFAULT 45,
  delay_max_sec INT NOT NULL DEFAULT 90,
  opening_message TEXT NOT NULL DEFAULT '',
  followup_day3_message TEXT NOT NULL DEFAULT '',
  followup_day7_message TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'parado' CHECK (state IN ('parado','rodando','pausado')),
  last_dispatch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blast_campaigns TO authenticated;
GRANT ALL ON public.blast_campaigns TO service_role;
ALTER TABLE public.blast_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blast_campaigns owner" ON public.blast_campaigns FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_blast_campaigns_updated BEFORE UPDATE ON public.blast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.blast_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.blast_campaigns(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  instagram TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado_abertura','enviado_d3','enviado_d7','respondeu','pulado','convertido')),
  last_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  skip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blast_contacts TO authenticated;
GRANT ALL ON public.blast_contacts TO service_role;
ALTER TABLE public.blast_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blast_contacts owner" ON public.blast_contacts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_blast_contacts_campaign ON public.blast_contacts(campaign_id, status);
CREATE INDEX idx_blast_contacts_phone ON public.blast_contacts(user_id, telefone);
CREATE TRIGGER trg_blast_contacts_updated BEFORE UPDATE ON public.blast_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.blast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.blast_campaigns(id) ON DELETE CASCADE,
  blast_contact_id UUID REFERENCES public.blast_contacts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('opening','d3','d7')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.blast_logs TO authenticated;
GRANT ALL ON public.blast_logs TO service_role;
ALTER TABLE public.blast_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blast_logs owner read" ON public.blast_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "blast_logs owner insert" ON public.blast_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_blast_logs_campaign ON public.blast_logs(campaign_id, created_at DESC);
