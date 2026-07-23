import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Agent V3 audio outbound persistence", () => {
  it("registra no CRM depois do envio de áudio confirmado", () => {
    const source = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    const send = source.indexOf("await uazapiSendAudio");
    const persist = source.indexOf('kind: "audio"', send);
    expect(send).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(send);
  });
});
