import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const webhook = source("src/routes/api/public/hooks/uazapi-webhook.ts");
const dispatcher = source("src/routes/api/public/hooks/agent-inbound-dispatcher.ts");
const testWebhook = source("src/routes/api/public/hooks/v3-test-webhook.ts");
const ownership = source("src/lib/agent-v3/inbound-webhook-ownership.server.ts");

describe("public Agent V3 runtime entrypoints", () => {
  it("routes the production webhook through durable Customer Turn ingress", () => {
    expect(webhook).toContain("beginWebhookAgentInboundRuntime");
    expect(webhook).toContain("dispatchReadyCustomerTurnById");
    expect(webhook).not.toContain("executeAgentV3Runtime(");
    expect(webhook).not.toContain("runAgentV3Turn(");
    expect(ownership).toContain("enqueueAgentInboundIntoCustomerTurn");
    expect(ownership).not.toContain("executeAgentV3Runtime");
  });

  it("uses the Customer Turn dispatcher rather than the legacy Stage B executor", () => {
    expect(dispatcher).toContain("dispatchCustomerTurnBatch");
    expect(dispatcher).not.toContain("dispatchAgentInboundBatch");
    expect(dispatcher).not.toContain("inbound-dispatch-policy.server");
  });

  it("keeps the historical public V3 test hook permanently inert", () => {
    expect(testWebhook).toContain('new Response("not found", { status: 404 })');
    expect(testWebhook).not.toContain("V3_TEST_WEBHOOK_ENABLED");
    expect(testWebhook).not.toContain("runAgentV3Turn");
    expect(testWebhook).not.toContain("executeAgentV3Runtime");
    expect(testWebhook).not.toContain("supabaseAdmin");
  });
});
