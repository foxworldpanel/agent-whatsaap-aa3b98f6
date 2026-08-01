ALTER TABLE public.customer_commercial_memory
  ADD COLUMN IF NOT EXISTS conversation_facts jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customer_commercial_memory.conversation_facts IS
  'Fatos estáveis informados pelo cliente: nome, música, artista e objetivo. Não é fonte comercial.';
