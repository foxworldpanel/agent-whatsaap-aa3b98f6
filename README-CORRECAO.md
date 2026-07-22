# Correção Agent V3: módulos e resposta por áudio

Substitua no GitHub estes dois arquivos, preservando os mesmos caminhos:

1. `src/lib/agent-v3/orchestrator.server.ts`
2. `src/routes/api/public/hooks/uazapi-webhook.ts`

## O que foi corrigido

- O conteúdo real dos módulos passa a ser interpolado no prompt enviado à Anthropic.
- `extraContext`, modo áudio, imagem e figurinha também passam a ser interpolados corretamente.
- A integração agora lê `openai_api_key`, `elevenlabs_api_key` e `elevenlabs_voice_id`.
- A transcrição do áudio usa a chave OpenAI salva na integração.
- Quando o cliente envia áudio, a resposta do agente é convertida em MP3 pelo ElevenLabs e enviada pela Uazapi como áudio.
- Se ElevenLabs não estiver configurado ou ocorrer erro no TTS/envio, o sistema envia texto como fallback para não deixar o cliente sem resposta.

## Configurações obrigatórias

Na tela de integrações, configure:

- Anthropic API Key
- OpenAI API Key (Whisper, para transcrever o áudio recebido)
- ElevenLabs API Key
- ElevenLabs Voice ID
- Uazapi URL e token

## Teste recomendado

1. Faça o deploy.
2. Aguarde pelo menos 30 segundos após editar módulos, por causa do cache local.
3. Envie um áudio curto pelo número autorizado.
4. Confirme nos logs:
   - transcrição concluída;
   - módulos selecionados;
   - `Resposta do agente enviada por áudio`.
5. Confirme no WhatsApp que a resposta chegou como áudio.

## Observação

O arquivo `src/lib/audio-out-gate.ts` não era usado pelo webhook de produção. A correção não usa esse gate porque a regra solicitada é direta: entrada em áudio deve gerar saída em áudio.
