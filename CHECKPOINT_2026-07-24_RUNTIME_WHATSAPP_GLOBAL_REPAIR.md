# Checkpoint — reparo global do runtime WhatsApp

Dois bloqueadores globais foram removidos:

1. Conversas não usam mais `upsert(... onConflict: ...)`.
   O webhook primeiro procura `(user_id, contact_id)`, atualiza se existir e insere
   se não existir. Em corrida, trata `23505` e reutiliza a conversa criada.
   Isso deixa o runtime compatível com bancos que passaram por diferentes versões
   das migrations de unicidade.

2. A consulta de `integrations` agora filtra por `workspace_id`.
   Sem isso, múltiplas linhas de integração do mesmo usuário podiam fazer
   `maybeSingle()` falhar e impedir o Agent V3 de responder em todos os números.

Novas conversas recebem `agent_enabled = true` explicitamente, sem depender do
default histórico do banco.
