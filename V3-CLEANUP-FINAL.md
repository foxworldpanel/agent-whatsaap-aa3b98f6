# Agent V3 — Limpeza final

Esta versão consolida a estrutura refatorada do Agent V3 e remove as cópias antigas que permaneceram na raiz.

## Alterações

- Removido `default-modules-v3.server.ts`.
- Removidas duplicações antigas de `admin`, `audit`, `brain`, `integrations`, `memory` e `selector` na raiz de `src/lib/agent-v3`.
- Removidos testes executáveis antigos de dentro de `src/lib/agent-v3`.
- Removidos testes duplicados que ainda apontavam para os caminhos antigos.
- Atualizados os imports restantes para a estrutura consolidada.
- Ajustado o teste contextual do Selector para o contrato CMS-driven atual (`Record<string, LoadedModuleV3>`).

## Estrutura oficial

- `admin/`
- `audit/`
- `brain/`
- `integrations/`
- `memory/`
- `prompt/`
- `selector/`
- `telemetry/`
- `orchestrator.server.ts`
- `router.server.ts`

## Validação

- `npm run build`: aprovado.
- Selector V3: 14 testes aprovados.
