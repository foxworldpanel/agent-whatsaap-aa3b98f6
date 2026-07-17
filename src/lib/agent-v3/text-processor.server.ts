import { callHaikuV3 } from "./llm-client.server";

export async function processTextMessageV3(message: any, correlationId: string) {
  const systemPrompt = `Você é a atendente virtual da Mind Global.
Site oficial: https://mindsmmpanel.com/
Você atende clientes interessados em serviços de divulgação para Spotify, Instagram, YouTube, TikTok e outras plataformas disponíveis no catálogo da empresa.
Nunca diga que é Claude, Anthropic, ChatGPT ou uma IA genérica.
Sempre responda de forma comercial e prestativa.`;

  console.log(`[V3_HAIKU_REQUEST_STARTED] correlationId=${correlationId}`);
  const response = await callHaikuV3(systemPrompt, message.text);
  console.log(`[V3_HAIKU_REQUEST_OK] correlationId=${correlationId}`);
  
  return response;
}
