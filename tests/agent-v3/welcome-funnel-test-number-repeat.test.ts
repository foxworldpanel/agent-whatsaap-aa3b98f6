import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Welcome funnel repeat test number", () => {
  it("libera repetição somente para o número pessoal de teste", () => {
    expect(webhook).toContain('"5511970116430"');
    expect(webhook).toContain("canRepeatWelcomeFunnelForTest(phoneStr)");
  });

  it("preserva completed para clientes normais e reseta completed somente no bypass de teste", () => {
    expect(webhook).toContain('repeatForTest && existingRun?.status === "completed"');
    expect(webhook).toContain('status: "failed"');
    expect(webhook).toContain("reset automático para número de teste");
  });
});
