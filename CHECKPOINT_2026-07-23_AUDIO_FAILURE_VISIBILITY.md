# Checkpoint — Audio Failure Visibility

Base: `agent-whatsaap-aa3b98f6-main(37).zip`

## Problema

O webhook já persistia a mensagem de áudio no CRM, mas dois caminhos de falha encerravam o processamento com HTTP 200 sem sinalizar a conversa:

- áudio sem `mediaUrl` ou sem chave OpenAI;
- erro durante a transcrição.

Isso podia deixar o cliente sem resposta e sem indicação de que um humano precisava assumir.

## Correção

Em ambos os casos o webhook agora marca a conversa com `needs_review = true` e grava um `review_reason` específico antes de encerrar o processamento.

O TTS da ElevenLabs continua com fallback para texto: falhar ao sintetizar a resposta não exige revisão humana se o envio por texto funcionar normalmente.

## Arquivos

- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/uazapi-webhook-audio-review.test.ts`
