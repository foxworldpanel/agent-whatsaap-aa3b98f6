import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(join(process.cwd(), "src/lib/agent-v3/runtime.server.ts"), "utf8");
const webhook = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"), "utf8");
const playground = readFileSync(join(process.cwd(), "src/lib/agent-v3/admin/playground.functions.ts"), "utf8");
const executor = readFileSync(join(process.cwd(), "src/lib/agent-v3/core/execute-agent.server.ts"), "utf8");
const dispatcher = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/agent-inbound-dispatcher.ts"), "utf8");
const recovery = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/agent-inbound-recovery.ts"), "utf8");
const funnelRunner = readFileSync(join(process.cwd(), "src/lib/welcome-funnel-runner.server.ts"), "utf8");
const funnelPlan = readFileSync(join(process.cwd(), "src/lib/welcome-funnel-plan.ts"), "utf8");

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
  it("keeps Playground and production on the same execution brain", () => {
    expect(playground).toContain('import("../core/execute-agent.server")');
    expect(playground).toContain("await executeAgent({");
    expect(runtime).toContain('import("@/lib/agent-v3/core/execute-agent.server")');
    expect(runtime).toContain("await executeAgent({");
    expect(executor).toContain("await runAgentV3Turn({");
    expect(playground).not.toContain("runAgentV3Turn({");
    expect(runtime).not.toContain("runAgentV3Turn({");
  });

  it("keeps finalization, split and audio decision aligned across transports", () => {
    expect(playground).toContain("finalizeAgentText(part");
    expect(runtime).toContain("finalizeAgentText(part");
    expect(playground).toContain("shouldReplyWithAudio({");
    expect(runtime).toContain("shouldReplyWithAudio({");
    expect(playground).toContain("execResult.agentResult?.replies");
    expect(runtime).toContain("v3Response.replies.length > 0 ? v3Response.replies : [v3Response.response]");
  });

  it("keeps durable dispatcher/recovery ownership outside the public webhook", () => {
    expect(dispatcher).toContain("dispatchCustomerTurnBatch");
    expect(recovery).toContain("processing_safe");
    expect(recovery).toContain("needs_review");
    expect(webhook).not.toContain("dispatchCustomerTurnBatch");
  });

  it("keeps Welcome Funnel plan shared and starts durable execution before resolving payloads", () => {
    expect(funnelPlan).toContain("WELCOME_FUNNEL_STEP_ORDER");
    expect(playground).toContain("resolveWelcomeFunnelPayloads");
    expect(funnelRunner).toContain("resolveWelcomeFunnelPayloads");
    const sequenceIndex = funnelRunner.indexOf("export async function runWelcomeFunnelSequence");
    const startIndex = funnelRunner.indexOf("await startExecutionState(", sequenceIndex);
    const resolveIndex = funnelRunner.indexOf("resolveWelcomeFunnelPayloads(", sequenceIndex);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(resolveIndex).toBeGreaterThan(startIndex);
  });
});
