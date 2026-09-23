import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(join(process.cwd(), "src/lib/agent-v3/runtime.server.ts"), "utf8");
const webhook = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"), "utf8");
const playground = readFileSync(join(process.cwd(), "src/lib/agent-v3/admin/playground.functions.ts"), "utf8");

describe("Agent V3 final architecture invariants", () => {
  it("keeps the public webhook ingress-only", () => {
    expect(webhook).toContain("enqueueWebhookInboundAroundWelcomeFunnel(");
    expect(webhook).toContain('return new Response("ok (agent customer turn durable)")');
    expect(webhook).not.toContain("executeAgent(");
    expect(webhook).not.toContain("runAgentV3Turn(");
    expect(webhook).not.toContain("withConversationLock(");
    expect(webhook).not.toContain("STOP_PATTERNS");
    expect(webhook).not.toContain("HUMAN_HANDOFF_PATTERNS");
  });

  it("fails closed after uncertain external terminal effects", () => {
    expect(runtime).toContain("runtime deve ser quarantined");
    expect(runtime).toContain("critical escalation sent but persistence failed");
    expect(runtime).toContain("human handoff sent but persistence failed");
    expect(runtime).toContain("smart router sent but persistence failed");
    expect(runtime).not.toContain('return runtimeTerminal("smart_router_send_failed")');
    expect(runtime).not.toContain('return runtimeTerminal("critical_escalation_failed")');
    expect(runtime).not.toContain('return runtimeTerminal("human_handoff_failed")');
  });

  it("persists simulated post-funnel state across Playground turns", () => {
    expect(playground).toContain("welcomeFunnelCompleted: true");
    expect((playground.match(/welcomeFunnelCompleted: funnelAlreadyCompleted/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(playground).toContain("previousFeedback?.welcomeFunnelCompleted === true");
  });
});
