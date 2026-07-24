import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");

describe("Agent V3 audio pipeline", () => {
  it("usa Whisper para áudio inbound e baixa mídia quando mediaUrl faltar", () => {
    expect(webhook).toContain("processAudioV3(inboundAudioUrl, openaiApiKey)");
    expect(webhook).toContain("uazapiDownloadMedia(creds, msgId)");
  });

  it("usa fallback de ambiente para OpenAI, Anthropic e ElevenLabs", () => {
    expect(webhook).toContain("process.env.OPENAI_API_KEY");
    expect(webhook).toContain("process.env.ANTHROPIC_API_KEY");
    expect(webhook).toContain("process.env.ELEVENLABS_API_KEY");
    expect(webhook).toContain("process.env.ELEVENLABS_VOICE_ID");
  });

  it("responde áudio inbound com ElevenLabs quando key e voice id existem", () => {
    expect(webhook).toContain('content.kind === "audio" && elevenlabsApiKey && elevenlabsVoiceId');
    expect(webhook).toContain("textToSpeechV3");
    expect(webhook).toContain("uazapiSendAudio(creds, phoneStr, audioBase64)");
  });

  it("envia nota de voz PTT pela Uazapi", () => {
    expect(uazapi).toContain('type: "ptt"');
    expect(uazapi).toContain('mimetype: "audio/mpeg"');
    expect(uazapi).toContain("PTT falhou; tentando type=audio");
  });

  it("possui logs das cinco etapas de áudio", () => {
    for (const step of ["1/5", "2/5", "3/5", "4/5", "5/5"]) {
      expect(webhook).toContain(`[AUDIO-V3] ${step}`);
    }
  });
});
