# Checkpoint — Webhook Retry Safety

Base: `agent-whatsaap-aa3b98f6-main(25).zip`

## Correções

- O `messageId` não é mais marcado como processado antes da mensagem ser persistida no CRM.
  Uma falha transitória de banco agora permite que a retransmissão do provedor tente novamente.
- A marca em memória só é criada quando a mensagem foi persistida com sucesso ou quando o banco
  confirmou que aquele `external_id` já existia.
- Se o upsert do CRM não retornar `conversationId`, o fluxo é tratado como falha de sincronização
  em vez de considerar silenciosamente a mensagem como concluída.
- A identidade fallback de mensagens sem `messageId` considera tipo, texto e URL de mídia,
  reduzindo colisões entre áudio/imagem e mensagens de texto.
- `cancelar` sozinho deixou de ser tratado como opt-out. O termo é ambíguo e pode significar
  cancelar apenas um pedido; somente pedidos inequívocos de interrupção de mensagens bloqueiam o contato.

## Arquivos alterados

- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/uazapi-webhook-stop-request.test.ts`
