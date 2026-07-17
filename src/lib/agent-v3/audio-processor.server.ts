import { transcribeAudioV3 } from "./whisper.server";
import { callHaikuV3 } from "./llm-client.server";

export async function processAudioMessageV3(message: any, correlationId: string) {
  try {
    console.log(`[V3_AUDIO_PROCESSING_STARTED] correlationId=${correlationId}`);
    
    if (!message.mediaUrl) {
      return "Não consegui baixar seu áudio. Pode enviar novamente ou escrever a mensagem?";
    }

    console.log(`[V3_WHISPER_REQUEST_STARTED] correlationId=${correlationId}`);
    const transcription = await transcribeAudioV3(message.mediaUrl, correlationId);
    console.log(`[V3_WHISPER_REQUEST_OK] correlationId=${correlationId}`);

    if (!transcription || typeof transcription !== 'string') {
      return "Não consegui entender esse áudio. Pode enviar novamente ou escrever a mensagem?";
    }

    const systemPrompt = `Você é a atendente virtual da Mind Global.
Site oficial: https://mindsmmpanel.com/
Você atende clientes interessados em serviços de divulgação para Spotify, Instagram, YouTube, TikTok e outras plataformas disponíveis no catálogo da empresa.
Nunca diga que é Claude, Anthropic, ChatGPT ou uma IA genérica.`;

    console.log(`[V3_HAIKU_REQUEST_STARTED] correlationId=${correlationId}`);
    const response = await callHaikuV3(systemPrompt, transcription);
    console.log(`[V3_HAIKU_REQUEST_OK] correlationId=${correlationId}`);
    
    return response;
  } catch (error: any) {
    console.error(`[V3_AUDIO_ERROR] correlationId=${correlationId} error=${error.message}`);
    return "Não consegui entender esse áudio. Pode enviar novamente ou escrever a mensagem?";
  }
}
