# Checkpoint — Áudio outbound + concorrência multi-instância

## Corrigido

- Respostas TTS enviadas com sucesso agora são registradas explicitamente no CRM como `kind = audio`, com o texto usado na síntese no `body`.
- O lock local por conversa foi mantido.
- O runtime passou a usar também `agent_generation_locks`, cuja PK por `conversation_id` fornece aquisição atômica entre processos/instâncias.
- Lock órfão com mais de 2 minutos pode ser recuperado.
- O lock é liberado em `finally`, inclusive em falha do Agent V3.

## Testes adicionados

- `webhook-audio-outbound-persistence.test.ts`
- `webhook-multi-instance-lock.test.ts`

## Limite

Os testes foram adicionados mas não executados neste ambiente porque o ZIP não contém `node_modules`.
