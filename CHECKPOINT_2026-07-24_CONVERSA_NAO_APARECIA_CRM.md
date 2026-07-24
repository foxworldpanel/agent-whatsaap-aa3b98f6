# Checkpoint — número recebia mensagem mas conversa não aparecia

## Causa encontrada

O webhook fazia:

`onConflict: "contact_id"`

na tabela `conversations`, porém a unicidade atual do banco é:

`(user_id, contact_id)`.

Isso podia fazer o upsert falhar antes de persistir a mensagem. Sem mensagem
persistida, o Agent V3 é corretamente bloqueado e a conversa não aparece no CRM.

## Correção

O webhook agora usa:

`onConflict: "user_id,contact_id"`

e o payload já atualiza:
- workspace_id;
- whatsapp_number_id;
- preview;
- timestamp/status.

Assim um contato antigo também é reassociado ao workspace/número conectado quando
chega uma nova mensagem.

A migration repara especificamente o número de teste 5511970116430 e mantém o
índice canônico de uma conversa por usuário/contato.
