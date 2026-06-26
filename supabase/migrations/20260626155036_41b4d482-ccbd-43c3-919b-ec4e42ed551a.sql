CREATE TABLE public.forbidden_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  deflection TEXT,
  position INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forbidden_rules TO authenticated;
GRANT ALL ON public.forbidden_rules TO service_role;
ALTER TABLE public.forbidden_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own forbidden_rules" ON public.forbidden_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_forbidden_rules_updated_at
  BEFORE UPDATE ON public.forbidden_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_forbidden_rules_user ON public.forbidden_rules(user_id, position);