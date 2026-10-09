-- Organiza a autoridade de pós-venda do Spotify no CMS.
-- Não cria verdade comercial no runtime: concentra a regra editável nos módulos.

UPDATE public.agent_modules_v3
SET content = $CONTENT$
MÓDULO SPOTIFY — PLAYS E OUVINTES

AUTORIDADE DE MÉTRICAS:
- Plays e ouvintes mensais são métricas diferentes.
- No serviço "Plays + Ouvintes", a quantidade contratada é garantida para PLAYS. Ex.: pedido de 1.000 recebe 1.000 plays.
- NÃO garanta que a quantidade de ouvintes será igual à quantidade de plays. Um mesmo ouvinte pode gerar mais de uma reprodução e a quantidade de ouvintes pode ficar abaixo da quantidade de plays.
- Não use faixa fixa do tipo "1.000 plays geram X a Y ouvintes". A quantidade de ouvintes não é exata.
- Os plays contratados nesse serviço têm garantia vitalícia.
- Ouvintes mensais usam uma janela móvel de aproximadamente 28 dias e podem diminuir com o tempo. Para continuarem contabilizados como ouvintes mensais, precisam continuar ouvindo dentro dessa janela.
- Na tela pública da faixa, antes de ultrapassar 1.000 plays, o Spotify pode mostrar "< 1.000". Isso NÃO significa que a faixa já tenha exatamente 1.000 plays.
- Nunca transforme "636 ouvintes mensais" ou qualquer contador de ouvintes em quantidade do pedido ou em quantidade de plays.
$CONTENT$,
    selector_intents = ARRAY['suporte','pos_compra']::text[],
    selector_stages = ARRAY['pos_venda','suporte']::text[],
    selector_platforms = ARRAY['spotify']::text[],
    selector_products = ARRAY['plays','ouvintes']::text[],
    selector_triggers = ARRAY['ouvintes','ouvinte mensal','ouvintes mensais','28 dias','plays','reproduções','reproducoes','< 1.000','menos de 1000','não subiu','nao subiu','não sobe','nao sobe','parou','continua igual','continua tudo igual']::text[],
    domain = 'PLATFORMS', platform = 'spotify', knowledge_type = 'support', status = 'active',
    priority = GREATEST(priority, 96), version = version + 1, updated_at = now()
WHERE key = 'spotify_ouvintes' AND workspace_id IS NOT NULL;

UPDATE public.agent_modules_v3
SET selector_intents = ARRAY['suporte','pos_compra']::text[],
    selector_stages = ARRAY['pos_venda','suporte']::text[],
    selector_platforms = ARRAY['spotify']::text[],
    selector_triggers = ARRAY['prazo','demora','quanto tempo','concluído','concluido','atualizou','atualizar','72 horas','24 horas','não apareceu','nao apareceu','não subiu','nao subiu','não sobe','nao sobe','parou','continua igual','continua tudo igual']::text[],
    domain = 'PLATFORMS', platform = 'spotify', knowledge_type = 'delivery', status = 'active',
    updated_at = now()
WHERE key = 'spotify_prazos' AND workspace_id IS NOT NULL;

UPDATE public.agent_modules_v3
SET content = $CONTENT$
MÓDULO SUPORTE

REGRAS:
- A Júlia NÃO tem acesso a pedido, saldo, histórico ou status interno e nunca finge ter consultado algo.
- Problema de pedido já realizado, entrega parada, contagem que não sobe, resultado abaixo do esperado, pagamento ou saldo: direciona para Painel > Suporte > abrir ticket já na primeira reclamação operacional.
- Oriente o cliente a informar o ID do pedido DENTRO do ticket para a equipe analisar.
- O Suporte do painel funciona 24 horas e faz a análise mais aprofundada do pedido.
- Nunca peça o ID para a Júlia "verificar", porque ela não consulta o sistema.
- Nunca diga "vou verificar", "vou consultar" ou "deixa eu checar aqui".
- Nunca crie novo pedido, mande recarregar ou mande pagar novamente quando o cliente está reclamando de um pedido existente.
- Só volta para fluxo de nova compra quando o cliente pedir explicitamente uma NOVA compra.
- Se houver um módulo específico da plataforma explicando a métrica, use essa explicação curta antes do encaminhamento quando ela responder diretamente à dúvida.
- EXCEÇÃO: dificuldade de cadastro ou navegação no painel, sem problema de pedido já feito, pode pedir 1 print para orientar.
$CONTENT$,
    selector_intents = ARRAY['suporte','pos_compra']::text[],
    selector_stages = ARRAY['pos_venda','suporte']::text[],
    selector_triggers = ARRAY['suporte','ticket','meu pedido','status do pedido','não chegou','nao chegou','não entregou','nao entregou','faltando','atraso','não subiu','nao subiu','não sobe','nao sobe','não aumentou','nao aumentou','não mudou','nao mudou','parou','continua igual','continua tudo igual','travado','travada']::text[],
    domain = 'ADMIN', platform = NULL, knowledge_type = 'support', status = 'active',
    priority = GREATEST(priority, 94), version = version + 1, updated_at = now()
WHERE key = 'suporte' AND workspace_id IS NOT NULL;

UPDATE public.agent_modules_v3 SET domain='PLATFORMS', platform='spotify', knowledge_type='pricing', status='active' WHERE key='spotify_precos' AND workspace_id IS NOT NULL;
UPDATE public.agent_modules_v3 SET domain='PLATFORMS', platform='spotify', knowledge_type='policy', status='active' WHERE key='spotify_garantia' AND workspace_id IS NOT NULL;
UPDATE public.agent_modules_v3 SET domain='PLATFORMS', platform='spotify', knowledge_type='links', status='active' WHERE key='spotify_links' AND workspace_id IS NOT NULL;
UPDATE public.agent_modules_v3 SET domain='PLATFORMS', platform='spotify', knowledge_type='policy', status='active' WHERE key='spotify_royalties' AND workspace_id IS NOT NULL;
UPDATE public.agent_modules_v3 SET domain='PLATFORMS', platform='spotify', knowledge_type='catalog', status='active' WHERE key='spotify_servicos' AND workspace_id IS NOT NULL;
