
CREATE TABLE public.opening_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  saudacoes_manha JSONB NOT NULL DEFAULT '[]'::jsonb,
  saudacoes_tarde JSONB NOT NULL DEFAULT '[]'::jsonb,
  saudacoes_noite JSONB NOT NULL DEFAULT '[]'::jsonb,
  linha2 JSONB NOT NULL DEFAULT '[]'::jsonb,
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_templates TO authenticated;
GRANT ALL ON public.opening_templates TO service_role;
ALTER TABLE public.opening_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own opening_templates" ON public.opening_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_opening_templates
  BEFORE UPDATE ON public.opening_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
