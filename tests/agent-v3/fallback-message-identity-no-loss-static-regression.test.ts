import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const identity = readFileSync("src/lib/agent-v3/inbound-message-identity.server.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260914393000_fallback_message_identity_no_loss.sql",
  "utf8",
);

describe("provider-id-less inbound safety", () => {
  it("uses a unique per-delivery identity instead of a lossy time/content bucket", () => {
    expect(webhook).toContain("buildFallbackInboundMessageId(phoneStr)");
    expect(webhook).not.toContain("Math.floor(Date.now() / 10000)");
    expect(webhook).not.toContain("function buildFallbackMessageId");
    expect(identity).toContain("randomUUID()");
    expect(identity).not.toContain("Date.now");
    expect(identity).not.toContain("charCodeAt");
  });

  it("keeps database defense in depth for legacy fallback callers", () => {
    expect(migration).toContain("NEW.external_id LIKE 'fb:%'");
    expect(migration).toContain("gen_random_uuid()");
    expect(migration).toContain("BEFORE INSERT ON public.messages");
  });
});
