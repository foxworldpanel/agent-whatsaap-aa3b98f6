import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeUazapiRecipient } from "@/lib/uazapi.server";

describe("Uazapi delivery regression", () => {
  it("preserves supported private JIDs and normalizes regular phones", () => {
    expect(normalizeUazapiRecipient("+55 (11) 99999-9999")).toBe("5511999999999");
    expect(normalizeUazapiRecipient("5511999999999@s.whatsapp.net")).toBe("5511999999999@s.whatsapp.net");
    expect(normalizeUazapiRecipient("246449686184160@lid")).toBe("246449686184160@lid");
  });

  it("uses the provider send target without storing it as the CRM phone", () => {
    const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    expect(webhook).toContain("const sendTarget = extractUazapiSendTarget(msgLocal) || phoneStr");
    expect(webhook).toContain("message.sender_pn");
    expect(webhook).toContain("message.key?.cleanedSenderPn");
  });

  it("does not discard a generated reply because a newer inbound was persisted", () => {
    const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    expect(webhook).not.toContain("ok (superseded by newer customer message)");
    expect(webhook).not.toContain("Resposta antiga suprimida");
  });

  it("persists the concrete delivery error for operational diagnosis", () => {
    const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
    expect(webhook).toContain("criticalErrorMessage");
    expect(webhook).toContain("falha crítica no Agent V3:");
  });
});
