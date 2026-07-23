# Checkpoint — Persistência da resposta outbound no CRM

## Achado

No caminho principal do Agent V3, `sendAgentTextGuarded()` enviava cada parte para a Uazapi,
mas o webhook não gravava explicitamente essas partes na tabela `messages`.

O sistema poderia depender do eco `fromMe` do provedor para que a resposta aparecesse no CRM.
Esse eco não deve ser tratado como garantia de persistência da resposta que acabou de ser
confirmada pelo próprio envio.

## Correção

Após cada `sendAgentTextGuarded()` concluído:

- a parte transformada é inserida em `messages`;
- `sender = agente`;
- o mesmo `conversation_id`, `user_id` e `workspace_id` do fluxo são usados;
- o histórico V3 continua sendo salvo somente depois da confirmação de envio.

A persistência é best-effort: uma falha ao escrever no CRM é registrada, mas não provoca
reenvio de uma mensagem que já chegou ao WhatsApp.

## Observação

Respostas enviadas como áudio continuam seguindo o caminho de áudio existente. A próxima
passada deve validar se o CRM precisa registrar também o outbound de áudio de forma explícita.
