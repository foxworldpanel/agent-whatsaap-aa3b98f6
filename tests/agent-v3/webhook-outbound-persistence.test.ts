import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Agent V3 runtime outbound persistence", () => {
  it("persiste a parte enviada no CRM após confirmação do send guard", () => {
    const source = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
    const sendIndex = source.indexOf("await sendAgentTextGuarded");
    const persistIndex = source.indexOf('.from("messages")', sendIndex);
    const bodyIndex = source.indexOf("body: sendResult.transformed", persistIndex);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(sendIndex);
    expect(bodyIndex).toBeGreaterThan(persistIndex);
  });
});
