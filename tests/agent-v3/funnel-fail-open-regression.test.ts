import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const webhook = readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const gate = readFileSync(
  "src/lib/welcome-funnel-webhook-gate.server.ts",
  "utf8",
);

describe("Welcome Funnel ownership uncertainty", () => {
  it("fails closed when the durable barrier or funnel query is unavailable", () => {
    expect(gate).toContain('status:"query_unavailable"');
    expect(gate).toContain(
      'result.status==="query_unavailable"||result.status==="conversation_blocked"',
    );
    expect(webhook).toContain("funnelRetryRequired");
    expect(webhook).toContain(
      '"retry (welcome funnel gate unavailable or busy)"',
    );
  });

  it("keeps the message durable before returning a retry response", () => {
    const persist = webhook.indexOf("persistWebhookAgentInboundJob");
    const retry = webhook.indexOf(
      "retry (welcome funnel gate unavailable or busy)",
    );
    expect(persist).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(persist);
  });

  it("does not restore direct legacy claims or local generation locking", () => {
    expect(webhook).not.toContain('.from("welcome_funnel_runs")');
    expect(webhook).not.toContain('.from("agent_generation_locks")');
    expect(webhook).not.toContain("claimErr.code");
    expect(webhook).not.toContain("acquireConversationDbLock");
  });
});
