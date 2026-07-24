# Checkpoint — correção do ID real do áudio Uazapi

## Causa provável encontrada

O webhook só extraía:
- messageid
- messageId
- id

Mas o próprio adapter Uazapi do projeto reconhece também:
- key_id
- wa_messageid

e alguns payloads usam `key.id`.

Quando nenhum dos três campos antigos existia, o webhook criava um ID de fallback
`fb:...`. Esse ID serve para deduplicação interna, mas NÃO é um ID válido para
`/message/download`. Por isso o CRM mostrava `[áudio recebido]` e o Whisper nunca
recebia a mídia real.

## Correções

- extractMessageId agora aceita messageid, messageId, id, key_id, wa_messageid e key.id;
- `/message/download` usa somente o body canônico documentado:
  `id + transcribe + openai_apikey`;
- se o download falhar OU responder 200 sem mídia/transcrição:
  - consulta `/message/find`;
  - encontra o áudio inbound mais recente;
  - recupera o `external_id` real;
  - tenta `/message/download` novamente;
- parsing da resposta ficou estrito para nunca confundir id/status/url com transcrição;
- logs informam se o ID era fallback e qual ID real foi recuperado.

Fluxo esperado:
WhatsApp -> ID real Uazapi -> message/download -> Whisper -> salva transcrição -> Claude -> ElevenLabs.
