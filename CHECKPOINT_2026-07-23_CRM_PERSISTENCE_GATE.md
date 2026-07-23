# Checkpoint — CRM Persistence Gate

Base: `agent-whatsaap-aa3b98f6-main(26).zip`

## Bug corrigido

O webhook continuava para os gates e para o Agent V3 mesmo quando a sincronização da mensagem de entrada com o CRM falhava. Isso permitia que o agente respondesse a uma mensagem que não estava persistida e, em uma retransmissão posterior do provedor, a mesma entrada pudesse gerar nova resposta.

## Correção

- A IA só é executada depois que a mensagem inbound foi persistida com sucesso.
- Duplicatas confirmadas pelo `external_id` continuam retornando `200` sem nova resposta.
- Falha/incompletude de persistência retorna `503`, deixando o `messageId` livre para retry do provedor.
- Foi adicionado teste de regressão garantindo que o guard de persistência aparece antes do bloco de processamento da IA.

## Arquivos alterados

- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/uazapi-webhook-ai-gates.test.ts`
