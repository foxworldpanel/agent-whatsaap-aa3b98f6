import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
  "utf8",
);

describe("Uazapi webhook - audio durable ownership", () => {
  it("persiste a referência do áudio antes de reconhecer ownership durável", () => {
    expect(source).toContain("audio_url: content.mediaUrl || undefined");
    expect(source).toContain("messageId: persistedMessageId");
    expect(source).toContain("inputKind: content.kind");
    expect(source).toContain("inputMime: content.mime");
    expect(source).toContain("enqueueWebhookInboundAroundWelcomeFunnel(");
  });

  it("não transcreve nem executa Agent V3 inline no webhook público", () => {
    expect(source).not.toContain("transcribeAudio");
    expect(source).not.toContain("runAgentV3Turn(");
    expect(source).not.toContain("executeAgent(");
    expect(source).toContain('return new Response("ok (agent customer turn durable)")');
  });
});
