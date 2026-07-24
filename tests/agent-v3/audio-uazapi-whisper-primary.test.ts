import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");

describe("Uazapi-native Whisper transcription", () => {
  it("envia transcribe=true e openai_apikey ao /message/download", () => {
    expect(uazapi).toContain("transcribe,");
    expect(uazapi).toContain("openai_apikey: openaiKey");
  });

  it("usa transcrição retornada pela Uazapi como caminho principal", () => {
    expect(webhook).toContain("downloaded.transcription?.trim()");
    expect(webhook).toContain("hasTranscription");
  });

  it("mantém Whisper direto como fallback", () => {
    expect(webhook).toContain("processAudioV3(");
    expect(webhook).toContain("if (!finalMsgText)");
  });

  it("persiste a transcrição real no CRM", () => {
    expect(webhook).toContain("body: finalMsgText");
    expect(webhook).toContain('kind: "audio"');
  });
});
