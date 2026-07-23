# Checkpoint — Propagação de workspace e proteção do webhook de teste

## Correções

- O playground agora envia `workspaceId` ao orquestrador V3. Antes, testes feitos em qualquer workspace podiam carregar silenciosamente o workspace padrão da Mind.
- O roteador V3 passou a aceitar e propagar `workspaceId`, `conversationId` e `phone`.
- O webhook público de teste ficou desabilitado por padrão e só responde quando `V3_TEST_WEBHOOK_ENABLED=true`.
- O webhook de teste agora carrega e propaga o `workspace_id` associado ao token da instância.
- Mensagens vazias não acionam o LLM nesse webhook.

## Arquivos alterados

- `src/lib/agent-v3/admin/playground.functions.ts`
- `src/lib/agent-v3/router.server.ts`
- `src/routes/api/public/hooks/v3-test-webhook.ts`
- `tests/agent-v3/workspace-propagation.test.ts`
