
INSERT INTO public.agent_modules_v3 (user_id, workspace_id, key, name, content, category, enabled, version, priority) 
VALUES 
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'identidade', 'Identidade', 'Sou a Júlia da Mind SMM.', 'Núcleo', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'regras_gerais', 'Regras Gerais', 'Responda curto.', 'Núcleo', true, 1, 0),
('f8da521a-e8db-4efe-8c9b-9bd69749c0a7', 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa', 'spotify', 'Spotify', 'Preço Spotify: R$ 10.', 'Redes', true, 1, 0)
ON CONFLICT (workspace_id, key) DO UPDATE SET content = EXCLUDED.content;
