import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Agent V3 webhook outbound persistence", () => {
  it("persiste a parte enviada no CRM após confirmação do send guard", () => {
    const source = fs.readFileSync(
      path.resolve("src/routes/api/public/hooks/uazapi-webhook.ts"),
      "utf8",
    );

    const sendIndex = source.indexOf("const sendResult = await sendAgentTextGuarded");
    const persistIndex = source.indexOf('.from("messages")', sendIndex);
    const bodyIndex = source.indexOf("body: sendResult.transformed", persistIndex);

    expect(sendIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(sendIndex);
    expect(bodyIndex).toBeGreaterThan(persistIndex);
  });
});
