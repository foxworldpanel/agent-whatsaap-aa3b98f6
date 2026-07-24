# Checkpoint — Uazapi /message/download como caminho primário de Whisper

A documentação Uazapi v2 informa que `/message/download` aceita:

- `id`
- `transcribe: true`
- `openai_apikey`

O runtime agora usa esse fluxo como primeira opção.

Fluxo:
1. áudio chega pelo webhook;
2. `/message/download` recebe messageId + chave OpenAI;
3. Uazapi baixa/descriptografa a mídia e solicita a transcrição Whisper;
4. se `transcription` vier preenchido, usa imediatamente;
5. se não vier, usa fileURL/fileData e chama nosso `processAudioV3` como fallback;
6. grava a transcrição no `messages.body` e no preview da conversa;
7. Claude recebe a transcrição;
8. ElevenLabs gera resposta;
9. Uazapi envia PTT.

Isso remove a dependência do `mediaUrl` do webhook para transcrever áudio.
