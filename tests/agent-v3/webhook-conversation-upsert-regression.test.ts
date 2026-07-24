import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Webhook conversation canonical upsert", () => {
  it("usa a constraint real user_id + contact_id", () => {
    expect(webhook).toContain('onConflict: "user_id,contact_id"');
    expect(webhook).not.toContain('onConflict: "contact_id"');
  });

  it("atualiza workspace e número no mesmo upsert", () => {
    const idx = webhook.indexOf('onConflict: "user_id,contact_id"');
    const before = webhook.slice(Math.max(0, idx - 700), idx);
    expect(before).toContain("workspace_id: num.workspace_id");
    expect(before).toContain("whatsapp_number_id: num.id");
  });
});
