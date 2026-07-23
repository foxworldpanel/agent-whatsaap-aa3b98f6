# Checkpoint — invalidação imediata do cache de configuração V3

## Problema

A configuração V3 é mantida em memória por 30 segundos. As rotas que salvam `agent_config` atualizavam o banco, porém não invalidavam esse cache. Por isso, a prévia do Agent V3 e outros consumidores de `loadAgentConfigV3` podiam continuar usando `modules_enabled`, `brand_blocks` e flags do catálogo antigas logo após o usuário salvar o painel.

## Correção

O cache do usuário e workspace agora é invalidado imediatamente após sucesso em:

- `saveAgentConfig`
- `saveAgentModules`
- `setCatalogFlags`

A invalidação ocorre somente depois de a gravação no banco terminar sem erro.

## Arquivo alterado

- `src/lib/agent.functions.ts`
