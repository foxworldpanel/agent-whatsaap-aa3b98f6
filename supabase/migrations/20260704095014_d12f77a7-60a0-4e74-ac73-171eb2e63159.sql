CREATE TABLE public.agent_identity (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  persona text,
  regra_emoji text,
  regra_split text,
  terminologia_redes text,
  regra_teste_gratis text,
  regra_anti_invencao text,
  exemplo_disparo text,
  reconhecimento_interesse text,
  regra_encerramento text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_identity TO authenticated;
GRANT ALL ON public.agent_identity TO service_role;
ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages identity" ON public.agent_identity
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER agent_identity_set_updated_at
  BEFORE UPDATE ON public.agent_identity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();