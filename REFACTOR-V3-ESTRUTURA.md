# Refatoração estrutural do Agente V3

## Alterações

- Removido `default-modules-v3.server.ts`; o CMS continua sendo a única fonte de conhecimento comportamental.
- Removidos testes executáveis antigos que estavam dentro de `src/lib/agent-v3`.
- Separado o Prompt Builder do Module Selector.
- Reorganizados componentes da V3 em `admin`, `audit`, `brain`, `integrations`, `memory`, `prompt`, `selector` e `telemetry`.
- Atualizados imports das rotas, webhook, Playground e testes.
- Reorganizados testes V3 em categorias de selector, integration e regression.
- Adicionada documentação da árvore e das responsabilidades.

## Compatibilidade

Os pontos públicos de produção permanecem:

- `src/lib/agent-v3/orchestrator.server.ts`
- `src/lib/agent-v3/router.server.ts`

O comportamento funcional do agente e os metadados do CMS não foram alterados.

## Validação

- `npm run build`: aprovado.
- `npx vitest run tests/agent-v3/selector/module-selector-cms.test.ts`: 10 testes aprovados.

Os avisos de `inputValidator()` são depreciações já existentes no projeto e não impedem o build.
