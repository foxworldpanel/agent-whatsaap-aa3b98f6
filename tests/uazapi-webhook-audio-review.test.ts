import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"),
  "utf8",
);

describe("Uazapi webhook - audio failure visibility", () => {
  it("flags audio without media URL or OpenAI key for human review", () => {
    expect(source).toContain('review_reason: !content.mediaUrl');
    expect(source).toContain('"áudio recebido sem URL de mídia"');
    expect(source).toContain('"áudio recebido sem chave OpenAI para transcrição"');
    expect(source).toContain('ok (audio unavailable; flagged for review)');
  });

  it("flags transcription errors for human review", () => {
    expect(source).toContain('review_reason: "falha ao transcrever áudio recebido"');
    expect(source).toContain('ok (audio transcription failed; flagged for review)');
  });
});
