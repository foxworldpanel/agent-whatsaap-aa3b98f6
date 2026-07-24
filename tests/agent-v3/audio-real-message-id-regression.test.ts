import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");

describe("Audio real Uazapi message id recovery", () => {
  it("aceita todos os IDs usados pelo próprio adapter Uazapi", () => {
    expect(webhook).toContain("m.key_id");
    expect(webhook).toContain("m.wa_messageid");
    expect(webhook).toContain("m.key?.id");
  });

  it("recupera o ID real via message/find quando o webhook não serve para download", () => {
    expect(webhook).toContain("uazapiListMessages(creds, phoneStr, 20)");
    expect(webhook).toContain("recentInboundAudio.external_id");
    expect(webhook).toContain("ID real recuperado via /message/find");
  });

  it("trata HTTP 200 sem mídia como falha e tenta recuperação", () => {
    expect(webhook).toContain(
      "Uazapi respondeu 200, mas sem transcrição ou arquivo para este messageId",
    );
  });

  it("faz parsing estrito da resposta para não confundir id/status com transcrição", () => {
    expect(uazapi).toContain("findStringByKeys");
    expect(uazapi).not.toContain("const found = findString(nested");
  });

  it("segue o body canônico documentado do message/download", () => {
    expect(uazapi).toContain("id: messageId");
    expect(uazapi).toContain("transcribe,");
    expect(uazapi).toContain("openai_apikey: openaiKey");
  });
});
