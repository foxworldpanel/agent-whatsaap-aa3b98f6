import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");
const audioProcessor = fs.readFileSync(
  "src/lib/agent-v3/integrations/audio-processor.server.ts",
  "utf8",
);

describe("Audio transcription persistence", () => {
  it("aceita mídia aninhada do payload Uazapi", () => {
    expect(webhook).toContain("findMediaReference");
    expect(webhook).toContain("findMediaReference(m.audioMessage)");
    expect(webhook).toContain("findMediaReference(m.pttMessage)");
  });

  it("usa URL ou base64 retornado por /message/download", () => {
    expect(webhook).toContain("downloaded.fileURL");
    expect(webhook).toContain("downloaded.fileData");
    expect(uazapi).toContain("fileData: string | null");
  });

  it("atualiza o body da mensagem com a transcrição real", () => {
    expect(webhook).toContain("body: finalMsgText");
    expect(webhook).toContain('.eq("external_id", msgId)');
    expect(webhook).toContain("last_message_preview: finalMsgText.slice(0, 120)");
  });

  it("Whisper aceita URL e data URI/base64", () => {
    expect(audioProcessor).toContain('/^data:audio\\\\//i');
    expect(audioProcessor).toContain('Buffer.from(match[2], "base64")');
    expect(audioProcessor).toContain('form.append("model", "whisper-1")');
  });
});
