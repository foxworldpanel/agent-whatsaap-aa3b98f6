export async function transcribeAudioV3(url: string, correlationId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  console.log(`[V3_MEDIA_DOWNLOAD_STARTED] url=${url} correlationId=${correlationId}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);
  
  const blob = await response.blob();
  console.log(`[V3_MEDIA_DOWNLOAD_OK] size=${blob.size} correlationId=${correlationId}`);

  const formData = new FormData();
  formData.append("file", blob, "audio.mp3");
  formData.append("model", "whisper-1");

  const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!whisperResponse.ok) {
    const error = await whisperResponse.text();
    throw new Error(`Whisper API Error: ${error}`);
  }

  const data = await whisperResponse.json();
  return data.text;
}
