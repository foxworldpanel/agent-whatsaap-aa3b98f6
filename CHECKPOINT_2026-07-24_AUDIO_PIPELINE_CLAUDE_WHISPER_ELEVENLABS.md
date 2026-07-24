# Checkpoint — Pipeline de áudio Agent V3

Fluxo final:

1. WhatsApp/Uazapi detecta áudio.
2. Se o webhook não trouxer `mediaUrl`, o runtime usa `/message/download`.
3. OpenAI Whisper (`whisper-1`) transcreve o áudio.
4. Claude/Anthropic recebe a transcrição e gera a resposta.
5. ElevenLabs (`eleven_multilingual_v2`, MP3 44.1kHz/128kbps) sintetiza a resposta.
6. Uazapi envia como `type = ptt` (nota de voz). Se a instância não aceitar PTT,
   tenta `type = audio` como fallback.

Credenciais:
- banco por workspace tem prioridade;
- fallback de ambiente:
  - ANTHROPIC_API_KEY
  - OPENAI_API_KEY
  - ELEVENLABS_API_KEY
  - ELEVENLABS_VOICE_ID

Diagnóstico:
O webhook registra `[AUDIO-V3] 1/5` até `[AUDIO-V3] 5/5`, permitindo saber
exatamente em qual etapa a cadeia falhou.

Correções adicionais:
- getIntegrations/previewVoice/diagnósticos passam a respeitar workspace;
- preview de voz também aceita credenciais do `.env`;
- `.env.example` ganhou `ELEVENLABS_VOICE_ID`.
