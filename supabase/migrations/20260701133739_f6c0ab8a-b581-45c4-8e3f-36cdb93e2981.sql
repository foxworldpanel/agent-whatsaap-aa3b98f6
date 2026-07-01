
CREATE TABLE public.agent_medias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('video','imagem')),
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  plataforma TEXT NOT NULL DEFAULT 'geral',
  gatilhos TEXT[] NOT NULL DEFAULT '{}',
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  auto_no_inicio BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_medias TO authenticated;
GRANT ALL ON public.agent_medias TO service_role;
ALTER TABLE public.agent_medias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages agent_medias" ON public.agent_medias
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_agent_medias_updated
  BEFORE UPDATE ON public.agent_medias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX agent_medias_owner_tipo_idx ON public.agent_medias(owner_id, tipo, ativo);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_media_sent JSONB;
