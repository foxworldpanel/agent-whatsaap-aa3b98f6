import OpenAI from "openai";

/**
 * Audio Processor Server Helper
 * Processes audio from Uazapi URL via OpenAI Whisper
 */
export async function transcribeAudio(audioUrl: string, correlationId: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`[AUDIO_PIPELINE][${correlationId}][ERROR] Missing OPENAI_API_KEY`);
    throw new Error("Transcriber not configured");
  }

  const openai = new OpenAI({ apiKey });

  try {
    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_DOWNLOAD_STARTED] URL: ${audioUrl}`);
    const response = await fetch(audioUrl);
    
    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_DOWNLOAD_RESPONSE] status: ${response.status}`);

    if (!response.ok) {
       console.error(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_DOWNLOAD_ERROR] status: ${response.status}`);
       throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type;
    const size = blob.size;
    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_DOWNLOADED] size: ${size}, type: ${mimeType}`);
    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_MIME_DETECTED] ${mimeType}`);

    const file = new File([blob], "audio.ogg", { type: mimeType });

    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][WHISPER_STARTED] model: whisper-1`);
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });

    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][WHISPER_HTTP_STATUS] 200`);
    console.log(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][TRANSCRIPTION_RESULT] "${transcription.text.slice(0, 50)}..."`);
    
    return transcription.text;
  } catch (error: any) {
    console.error(`[V2_DIAGNOSTIC][${correlationId}][${new Date().toISOString()}][AUDIO_PIPELINE_ERROR]`, {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n')[1]
    });
    throw error;
  }
}
