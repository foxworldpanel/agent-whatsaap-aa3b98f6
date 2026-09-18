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
const inbound = readFileSync(
  "src/lib/agent-v3/inbound-welcome-funnel-gate.server.ts",
  "utf8",
);

describe("Welcome Funnel -> Agent V3 ordering", () => {
  it("checks the conversation-wide durable barrier before trigger discovery", () => {
    expect(gate.indexOf("getWelcomeFunnelConversationBarrier")).toBeLessThan(
      gate.indexOf('.from("welcome_funnels")'),
    );
    expect(gate).toContain('status:"conversation_blocked"');
  });

  it("persists later messages instead of manually replaying another body", () => {
    expect(webhook).toContain("persistWebhookAgentInboundJob");
    expect(webhook).not.toContain("queuedInbound");
    expect(webhook).not.toContain("queuedBody");
    expect(webhook).not.toContain("deferredFunnelMessage");
  });

  it("resolves full routing identity and rechecks the barrier immediately before Customer Turn attachment", () => {
    const body = inbound.slice(inbound.indexOf("export async function enqueueWebhookInboundAroundWelcomeFunnel"));
    const user = body.indexOf("await resolveInboundUserId");
    const barrierCall = body.indexOf("await getWelcomeFunnelConversationBarrier", user);
    const blocked = body.indexOf('if(barrier!=="clear")', barrierCall);
    const persist = body.indexOf("await persistWebhookAgentInboundJob", blocked);
    const beginCall = body.indexOf("await beginWebhookAgentInboundRuntime", blocked);
    expect(user).toBeGreaterThanOrEqual(0);
    expect(barrierCall).toBeGreaterThan(user);
    expect(blocked).toBeGreaterThan(barrierCall);
    expect(persist).toBeGreaterThan(blocked);
    expect(beginCall).toBeGreaterThan(blocked);
  });

  it("never uses a test-number replay bypass", () => {
    expect(webhook).not.toContain("canRepeatWelcomeFunnelForTest");
    expect(webhook).not.toContain("WELCOME_FUNNEL_REPEAT_TEST_PHONES");
    expect(webhook).not.toContain("5511970116430");
  });
});
