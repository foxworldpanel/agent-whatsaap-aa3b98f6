
INSERT INTO public.agent_modules_v3 (user_id, workspace_id, key, name, content, category, enabled, version, priority) 
VALUES 
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'comportamento_humano', 'Comportamento Humano', 'COMPORTAMENTO:
- Use gírias leves se o cliente usar.
- Divida mensagens longas com ===SPLIT===.', 'Núcleo', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'fluxo_vendas', 'Fluxo de Vendas', 'VENDAS:
1. Saudação.
2. Identificar necessidade.
3. Proposta de valor.
4. Fechamento.', 'Fluxo', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'texto_ou_audio', 'Texto ou Áudio', 'MÓDULO TEXTO OU ÁUDIO:
- Se receber áudio, responda em texto resumindo o que entendeu.', 'Infra', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'suporte', 'Suporte', 'SUPORTE:
- Pedir para abrir ticket em mindsmmpanel.com informando o ID do pedido.', 'Suporte', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'tabela_precos', 'Tabela de Preços', 'PREÇOS:
- Consulte a tabela específica da rede solicitada.', 'Vendas', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'fechamento_3', 'Fechamento', 'FECHAMENTO:
1. Confirmar pedido.
2. Direcionar para o painel.
3. Solicitar cadastro.', 'Fluxo', true, 1, 0)
ON CONFLICT (workspace_id, key) DO UPDATE SET content = EXCLUDED.content;
