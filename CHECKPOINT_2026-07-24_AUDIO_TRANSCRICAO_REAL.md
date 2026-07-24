# Checkpoint — áudio recebido -> transcrição real no CRM

Correções:
- payload Uazapi agora procura mídia também em campos aninhados de audioMessage/pttMessage;
- /message/download tenta `id`, `messageId` e `messageid`;
- resposta do download aceita URL pública ou base64/data URI;
- Whisper aceita URL, data URI e base64;
- depois do Whisper, o registro inbound em `messages` é atualizado:
  - `body` recebe a transcrição real;
  - `kind` permanece `audio`;
  - preview da conversa recebe a transcrição;
- a tela deixa de ficar presa em `[áudio recebido]` quando a transcrição funcionou.

Fluxo esperado:
WhatsApp/Uazapi -> resolve mídia -> Whisper -> grava transcrição -> Claude -> ElevenLabs -> PTT Uazapi.
