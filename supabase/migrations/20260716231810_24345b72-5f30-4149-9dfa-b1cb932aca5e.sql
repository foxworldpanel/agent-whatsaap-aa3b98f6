-- Adiciona a coluna contexto_v2 para persistência do estado da Agente Mind V2
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS contexto_v2 JSONB;

-- Mantém as permissões
GRANT UPDATE, SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
