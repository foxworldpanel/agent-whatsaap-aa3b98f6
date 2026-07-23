# Checkpoint — Webhook: deduplicação persistente e opt-out

## Correções

- Retransmissões do mesmo `messageId` agora usam TTL de 24 horas na memória, sem contador permanente.
- Duplicatas detectadas pelo `external_id` único no banco não continuam até o Agent V3 após reinício ou em outra instância.
- Pedidos explícitos para parar passam a ser persistidos:
  - desativam o agente na conversa;
  - marcam a conversa para revisão;
  - bloqueiam o contato no CRM;
  - limpam a memória V3 da conversa.
- Foram adicionados testes para os padrões de opt-out e para frases ambíguas que não devem bloquear o contato.

## Arquivos

- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/uazapi-webhook-stop-request.test.ts`
