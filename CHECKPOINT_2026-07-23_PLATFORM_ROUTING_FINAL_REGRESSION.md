# Checkpoint — Platform routing final regression

## Verificado no código executável

- `selectModulesV3` detecta plataforma/intenção/produto e seleciona módulos pelos metadados do CMS.
- O fallback `key === platform` garante o módulo principal da rede quando ativo.
- Dependências são transitivas e conflitos são resolvidos por prioridade.
- O prompt builder deduplica chaves e ignora módulos ausentes/vazios.
- Não há import do `ai.server.ts` legado dentro do runtime V3 auditado.

## Alterações desta etapa

- Adicionado teste de regressão para impedir carregamento cruzado Spotify/YouTube/Instagram/TikTok.
- Adicionado teste para módulo customizado `spotify_precos` roteado pelo CMS.
- Adicionada migration forward-only de consolidação do roteamento das plataformas com `workspace_id IS NOT NULL`, sem alterar conteúdo/preços/status.
- A migration histórica `20260722220000...` foi preservada para não quebrar histórico de banco já aplicado.

## Limite de validação

O ZIP não contém `node_modules`; portanto os novos testes não foram executados neste ambiente. Eles foram adicionados para rodar via `npm test`/Vitest no ambiente com dependências instaladas.
