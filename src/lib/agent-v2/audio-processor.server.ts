import OpenAI from "openai";

/**
 * Audio Processor Server Helper
 * Processes audio from Uazapi URL via OpenAI Whisper
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[AUDIO_PROCESSOR] Missing OPENAI_API_KEY");
    throw new Error("Transcriber not configured");
  }

  const openai = new OpenAI({ apiKey });

  try {
    console.log(`[AUDIO_PROCESSOR] Fetching audio: ${audioUrl}`);
    const response = await fetch(audioUrl);
    if (!response.ok) {
       throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const file = new File([blob], "audio.ogg", { type: blob.type });

    console.log(`[AUDIO_PROCESSOR] Sending to Whisper...`);
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });

    console.log(`[AUDIO_PROCESSOR] Transcription successful: ${transcription.text.slice(0, 50)}...`);
    return transcription.text;
  } catch (error: any) {
    console.error(`[AUDIO_PROCESSOR] Error:`, error.message);
    throw error;
  }
}
