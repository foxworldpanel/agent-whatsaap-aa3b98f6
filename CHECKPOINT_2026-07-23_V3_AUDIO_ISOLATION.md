# Checkpoint — isolamento de áudio do Agent V3

## Alterações

- Removida a dependência do Agent V3 em `ai.server.ts` para transcrição de áudio.
- Removida a dependência do webhook V3 em `ai.server.ts` para TTS ElevenLabs.
- Removida a dependência do splitter legado em `message-splitter.ts`.
- A integração OpenAI Whisper agora vive em `agent-v3/integrations/audio-processor.server.ts`.
- O TTS ElevenLabs agora vive no mesmo módulo de integração V3 (`textToSpeechV3`).
- Transcrição vazia deixa de virar texto artificial enviado ao LLM; agora falha explicitamente para o fallback do webhook tratar.

## Objetivo

Preservar a separação física V3/V1-V2 e impedir que alterações no agente legado mudem silenciosamente o comportamento de áudio do Agent V3.
