# Checkpoint — integridade de conflitos e dependências

## Arquivo corrigido

- `src/lib/agent-v3/selector/module-selector.server.ts`

## Problema

A resolução de conflitos podia remover uma dependência obrigatória e manter o módulo dependente selecionado. Isso produzia um prompt incompleto: o módulo principal entrava sem uma regra ou conteúdo de que dependia.

Também havia risco de continuar processando conflitos de um módulo que já tinha sido removido no mesmo ciclo.

## Correção

- ignora módulos já removidos durante a resolução de conflitos;
- interrompe o processamento de conflitos quando o próprio módulo perde o conflito;
- valida novamente todas as dependências após os conflitos;
- remove, em cascata, módulos cujas dependências obrigatórias não permaneceram selecionadas;
- registra aviso diagnóstico com o módulo e a dependência ausente.

## Teste adicionado

- `tests/agent-v3/selector/module-selector-conflicts.test.ts`

Cobre:

1. dependência eliminada por conflito, com remoção segura do dependente;
2. preservação de dependências transitivas quando não há conflito.

## Validação

A estrutura do ZIP e os arquivos alterados foram verificados. Os testes automatizados não foram executados porque o ZIP não contém `node_modules`.
