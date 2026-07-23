# Checkpoint — AI Failure Visibility

## Problema
O webhook persistia a mensagem do cliente e, se o Agent V3 falhasse depois, retornava HTTP 200 sem marcar a conversa. Isso evitava duplicidade, mas podia deixar uma mensagem sem resposta e sem sinalização para atendimento humano.

A consulta das integrações de IA também não verificava explicitamente o erro retornado pelo Supabase.

## Correção
- Erro ao carregar integrações agora é registrado e marca `needs_review` na conversa.
- Erro crítico do Agent V3 agora marca `needs_review` e `review_reason` antes de retornar 200.
- Mantido HTTP 200 após a mensagem já estar persistida para não induzir retransmissão/segunda resposta pelo provedor.

## Arquivo
- `src/routes/api/public/hooks/uazapi-webhook.ts`
