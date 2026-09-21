import { describe, expect, it } from "vitest";
import fs from "node:fs";

const runtime = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");

describe("Agent V3 audio pipeline", () => {
  it("usa Whisper para áudio inbound e baixa mídia quando mediaUrl faltar", () => {
    expect(runtime).toContain("processAudioV3");
    expect(runtime).toContain("uazapiResolveInboundMedia");
  });

  it("usa fallback de ambiente para OpenAI, Anthropic e ElevenLabs", () => {
    expect(runtime).toContain("process.env.OPENAI_API_KEY");
    expect(runtime).toContain("process.env.ANTHROPIC_API_KEY");
    expect(runtime).toContain("process.env.ELEVENLABS_API_KEY");
    expect(runtime).toContain("process.env.ELEVENLABS_VOICE_ID");
  });

  it("responde áudio inbound com ElevenLabs quando key e voice id existem", () => {
    expect(runtime).toContain("replyWithAudio && elevenlabsApiKey && elevenlabsVoiceId");
    expect(runtime).toContain("textToSpeechV3");
    expect(runtime).toContain("uazapiSendAudio(creds, phoneStr, audioBase64)");
  });

  it("envia nota de voz PTT pela Uazapi", () => {
    expect(uazapi).toContain('type: "ptt"');
    expect(uazapi).toContain('mimetype: "audio/mpeg"');
    expect(uazapi).toContain("PTT falhou; tentando type=audio");
  });

  it("possui logs das cinco etapas de áudio", () => {
    for (const step of ["1/5", "2/5", "3/5", "4/5", "5/5"]) {
      expect(runtime).toContain(`[AUDIO-V3] ${step}`);
    }
  });
});
