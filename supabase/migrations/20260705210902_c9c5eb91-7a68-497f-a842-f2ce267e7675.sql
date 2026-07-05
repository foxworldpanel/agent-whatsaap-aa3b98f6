ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS brand_blocks jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agent_config.brand_blocks IS
  'Marca/negócio: blocos textuais específicos do workspace (respostas_padrao, regra_mq_hq, regra_autoridade). Passo 1 do refactor safety-vs-brand: coluna vazia agora, seed do Mind vem em INSERT separado.';