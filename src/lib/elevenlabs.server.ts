import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * ElevenLabs TTS Helper
 * Generates audio from text and returns a public URL.
 */
export async function generateSpeech(text: string, voiceId: string = "pNInz6obpg8pDAr9vuRm"): Promise<string | null> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    console.error("[ElevenLabs] Missing ELEVEN_LABS_API_KEY");
    return null;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ElevenLabs] API Error: ${response.status} ${errorText}`);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const fileName = `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;

    // Upload to Lovable Cloud Storage (Supabase)
    const { data, error } = await supabaseAdmin.storage
      .from("audio_responses")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        cacheControl: "3600",
      });

    if (error) {
      console.error("[ElevenLabs] Storage upload failed:", error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("audio_responses")
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (err) {
    console.error("[ElevenLabs] Unexpected error:", err);
    return null;
  }
}
