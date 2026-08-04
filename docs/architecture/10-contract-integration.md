# Integração Passiva dos Contratos — Sprint 3.2 → 3.2.1 (revisado)

## Objetivo
Começar a usar a camada de contratos (Sprint 3.1) de forma real, mas sem qualquer risco, e **sem adicionar responsabilidade ao Module Selector**.

## Mudança de arquitetura (revisão pós Sprint 3.2)
A primeira versão desta sprint conectou a validação de contrato dentro de `logModuleSelectorExecution()`, no próprio arquivo do Module Selector. Isso funcionava e era seguro, mas violava o princípio de responsabilidade única — o Selector passaria a "conhecer" contratos, mesmo que só pra log.

**Revisado:** a validação foi extraída pra um componente totalmente independente.

```
Module Selector
      │
      ▼
Selection Result (selectableModules)
      │
      ▼
orchestrator.server.ts
      │
      ▼
Reporter (contracts/module-contract-reporter.ts)
      │
      ▼
Log
```

O Module Selector **não importa, não conhece e nunca chamou** o reporter — ele só produz o resultado da seleção. É o `orchestrator.server.ts` quem, depois de já ter chamado o Selector, separadamente chama o Reporter. Se o Reporter fosse removido amanhã, o Selector não notaria nenhuma diferença.

## Onde os contratos passaram a ser usados

**`src/lib/agent-v3/contracts/module-contract-reporter.ts`** (novo arquivo, isolado):
- `buildContractReport(modules)` — avalia um conjunto de módulos contra o contrato, retorna um resumo (`total`, `classified`, `invalid`, `invalidDetails`)
- `logContractReport(modules, runId)` — chama `buildContractReport` e loga, respeitando a flag de ambiente

**`src/lib/agent-v3/orchestrator.server.ts`** — chama `logContractReport()` logo depois de chamar o Module Selector, usando o mesmo conjunto de módulos avaliados naquele turno.

## Flag de ambiente
```typescript
const CONTRACT_REPORTING_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_CONTRACT_REPORTING === "true";
```
Ligado por padrão fora de produção. Em produção, só liga se `ENABLE_CONTRACT_REPORTING=true` for setado explicitamente. Isso prepara a base pro cenário futuro citado na revisão (crescimento pra centenas de módulos) sem custo nenhum hoje.

## Onde os contratos NÃO foram usados (decisão consciente, mantida da Sprint 3.2)
**`LoadedModuleV3`** — continua sem ser alterado, pelo mesmo motivo já documentado: é usado em muitos arquivos, trocar sua forma teria efeito cascata sem benefício real imediato.

**Module Selector** — voltou a ficar 100% livre de qualquer menção a "contract" (confirmado: zero ocorrências da palavra no arquivo).

## Próximos passos para integração completa
- Quando a migration que adiciona os 4 campos novos na tabela existir, o `classified` no relatório vira termômetro real de progresso
- `admin.functions.ts` continua sendo candidato natural pra próxima integração — ainda fora do escopo desta sprint

## Status desta sprint
Validação passiva ativa, mas 100% desacoplada do Module Selector. Reporter é um componente independente, chamado pelo orchestrator. Nenhuma mudança de comportamento, seleção de módulos, Prompt Builder ou Router.
