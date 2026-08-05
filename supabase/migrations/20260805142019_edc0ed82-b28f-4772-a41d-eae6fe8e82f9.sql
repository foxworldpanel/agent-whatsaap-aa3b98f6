
ALTER TABLE public.agent_modules_v3
ADD COLUMN IF NOT EXISTS domain TEXT;

ALTER TABLE public.agent_modules_v3
ADD COLUMN IF NOT EXISTS platform TEXT;

ALTER TABLE public.agent_modules_v3
ADD COLUMN IF NOT EXISTS knowledge_type TEXT;

ALTER TABLE public.agent_modules_v3
ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.agent_modules_v3
SET domain = 'GLOBAL'
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
  AND key IN ('pagamento', 'como_comprar_no_painel', 'suporte', 'seguranca_pix');
