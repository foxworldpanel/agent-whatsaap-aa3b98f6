// src/lib/agent-v3/integrations/audio-processor.server.ts

const LONG_MESSAGE_THRESHOLD = 350;

function isMeaningfulPart(raw: string): boolean {
  const trimmed = raw?.trim();
  return Boolean(trimmed && /[\p{L}\p{N}]/u.test(trimmed));
}

/**
 * Transcrição própria da V3. Mantém a integração técnica isolada do legado V1/V2.
 */
export async function processAudioV3(audioUrl: string, openaiApiKey?: string): Promise<string> {
  const url = audioUrl?.trim();
  if (!url) throw new Error("Audio URL is required");

  const apiKey = openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente para transcrição do Agent V3");

  console.info("[agent-v3] Starting audio transcription...");

  const audio = await fetch(url);
  if (!audio.ok) throw new Error(`Falha ao baixar áudio (${audio.status})`);

  const blob = await audio.blob();
  const headerMime = (blob.type || "").split(";")[0].trim().toLowerCase();
  const ext =
    headerMime.includes("mpeg") ? "mp3" :
    headerMime.includes("mp4") || headerMime.includes("m4a") ? "m4a" :
    headerMime.includes("wav") ? "wav" :
    headerMime.includes("webm") ? "webm" :
    headerMime.includes("flac") ? "flac" : "ogg";

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", blob, `audio.${ext}`);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Whisper falhou (${response.status}): ${details.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { text?: unknown };
  if (typeof payload.text !== "string") {
    throw new Error("Falha crítica na transcrição: resposta sem texto válido");
  }

  const transcript = payload.text.trim();
  if (!transcript) {
    throw new Error("Áudio sem conteúdo legível");
  }

  console.info(`[agent-v3] Transcription successful: ${transcript.length} chars`);
  return transcript;
}

/**
 * TTS próprio da V3. Retorna data URL MP3 para o sender da Uazapi.
 */
export async function textToSpeechV3(params: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<string> {
  const apiKey = params.apiKey?.trim();
  const voiceId = params.voiceId?.trim();
  const text = params.text?.trim();

  if (!apiKey) throw new Error("ElevenLabs API key ausente");
  if (!voiceId) throw new Error("ElevenLabs voiceId ausente");
  if (!text) throw new Error("Texto vazio para TTS");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`ElevenLabs falhou (${response.status}): ${details.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
}

/**
 * Splitter local da V3. Evita dependência funcional do message-splitter legado.
 */
export function autoSplitLongPartsV3(text: string, _threshold = LONG_MESSAGE_THRESHOLD): string[] {
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const explicitParts = trimmed
    .split(/===SPLIT===/i)
    .map((part) => part.trim())
    .filter(isMeaningfulPart);

  const output: string[] = [];
  for (const part of explicitParts) {
    if (!/\n\s*\n/.test(part)) {
      output.push(part);
      continue;
    }

    const paragraphs = part
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(isMeaningfulPart);

    if (paragraphs.length <= 1) output.push(part);
    else output.push(...paragraphs);
  }

  return output.length > 0 ? output : [trimmed];
}
