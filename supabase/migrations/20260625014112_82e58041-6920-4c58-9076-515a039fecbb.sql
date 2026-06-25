
CREATE TABLE public.knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','text')),
  context TEXT,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_base_user_idx ON public.knowledge_base(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;
GRANT ALL ON public.knowledge_base TO service_role;

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_owner_all" ON public.knowledge_base
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER knowledge_base_set_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
