
CREATE TABLE public.prompt_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  modulo_key TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, modulo_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_modules TO authenticated;
GRANT ALL ON public.prompt_modules TO service_role;
ALTER TABLE public.prompt_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prompt_modules" ON public.prompt_modules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER prompt_modules_set_updated_at
  BEFORE UPDATE ON public.prompt_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
