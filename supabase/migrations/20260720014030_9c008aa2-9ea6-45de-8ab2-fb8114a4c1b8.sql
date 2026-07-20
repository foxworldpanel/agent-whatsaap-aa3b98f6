-- Insert agent_config if it doesn't exist for the primary user
INSERT INTO public.agent_config (user_id, workspace_id, modules_enabled, brand_blocks, catalog_in_prompt, catalog_only_relevant)
SELECT 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 
'{"spotify": true, "instagram": true, "youtube": true, "tiktok": true, "kwai": true, "facebook": true, "x_twitter": true, "pagamentos": true, "suporte": true, "teste_gratis": true, "identidade": true, "regras_gerais": true, "comportamento_humano": true, "fluxo_vendas": true, "tecnicas_vendas": true}'::jsonb,
'{}'::jsonb, true, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_config WHERE user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'
);

-- Update existing if it was somehow empty or incomplete
UPDATE public.agent_config
SET modules_enabled = '{"spotify": true, "instagram": true, "youtube": true, "tiktok": true, "kwai": true, "facebook": true, "x_twitter": true, "pagamentos": true, "suporte": true, "teste_gratis": true, "identidade": true, "regras_gerais": true, "comportamento_humano": true, "fluxo_vendas": true, "tecnicas_vendas": true}'::jsonb
WHERE user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7';
