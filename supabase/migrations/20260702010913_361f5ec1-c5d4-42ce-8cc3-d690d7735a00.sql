
CREATE TABLE public.blast_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.blast_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Fluxo padrão',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blast_flows TO authenticated;
GRANT ALL ON public.blast_flows TO service_role;
ALTER TABLE public.blast_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own blast_flows"
  ON public.blast_flows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER blast_flows_updated_at BEFORE UPDATE ON public.blast_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
