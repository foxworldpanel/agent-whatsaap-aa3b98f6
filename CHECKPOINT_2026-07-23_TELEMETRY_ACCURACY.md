# Checkpoint — Precisão da telemetria do Agent V3

## Arquivo alterado

- `src/lib/agent-v3/orchestrator.server.ts`

## Problema corrigido

A telemetria de tokens por módulo era calculada antes da montagem definitiva do prompt, usando `selectedKeys`. Quando o `prompt-builder` descartava um módulo inexistente ou vazio, esse módulo ainda aparecia em `estimated_tokens_by_module`, criando divergência entre o prompt real, os logs e a auditoria.

## Correção

- A telemetria agora é calculada depois de `buildPromptFromModulesDetailed`.
- A fonte passou a ser `effectiveSelectedKeys`, que contém somente os módulos realmente incluídos.
- O nome do módulo usa o nome cadastrado no CMS quando disponível.
- Tokens, versões, contagem e logs passam a representar o prompt efetivamente enviado ao LLM.

## Validação executada

- ZIP de origem extraído com sucesso.
- Alteração conferida diretamente no arquivo.
- Estrutura do novo ZIP validada com `unzip -t`.

Os testes automatizados não foram executados porque o projeto fornecido não inclui `node_modules`.
