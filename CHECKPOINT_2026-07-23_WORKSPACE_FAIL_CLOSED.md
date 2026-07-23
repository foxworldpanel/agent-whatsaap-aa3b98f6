# Checkpoint — Workspace Fail Closed

Base: `agent-whatsaap-aa3b98f6-main(31).zip`

## Problema

O runtime V3 ainda possuía um fallback silencioso para o workspace fixo da Mind quando `workspaceId` não era informado. Isso existia tanto no orquestrador quanto na memória (`conversations_v3`).

Em caso de configuração incompleta de um número/integração, o agente podia carregar módulos e/ou histórico do workspace padrão em vez de interromper o turno.

## Correção

- `runAgentV3Turn` agora exige `workspaceId` em runtime e falha antes de carregar módulos quando ele está ausente.
- `getConversationStateV3`, `saveConversationStateV3` e `clearConversationStateV3` não usam mais workspace padrão.
- O webhook principal valida `whatsapp_numbers.workspace_id` antes de consultar o gate do agente, criar lock, acessar memória ou executar o V3.
- O webhook de teste também falha com HTTP 503 quando a instância não possui workspace.
- O lock de conversa usa sempre o workspace real, sem a chave genérica `default`.
- Opt-out e persistência de histórico reutilizam o mesmo `workspaceId` já validado.

## Arquivos

- `src/lib/agent-v3/orchestrator.server.ts`
- `src/lib/agent-v3/memory/conversation-state.server.ts`
- `src/lib/agent-v3/router.server.ts`
- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `src/routes/api/public/hooks/v3-test-webhook.ts`
- `tests/agent-v3/workspace-required.test.ts`

## Comportamento esperado

Se uma instância perder ou não tiver `workspace_id`, o Agent V3 não tenta adivinhar um tenant. O processamento automático é bloqueado até a configuração ser corrigida.
