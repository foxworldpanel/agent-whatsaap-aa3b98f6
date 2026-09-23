import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recovery = readFileSync(resolve(process.cwd(), "src/routes/api/public/hooks/agent-inbound-recovery.ts"), "utf8");
const lock = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/conversation-lock.server.ts"), "utf8");
const funnelPlan = readFileSync(resolve(process.cwd(), "src/lib/welcome-funnel-plan.ts"), "utf8");
const funnelRunner = readFileSync(resolve(process.cwd(), "src/lib/welcome-funnel-runner.server.ts"), "utf8");

describe("generation lock recovery lease horizon", () => {
  it("keeps durable Stage B recovery at five minutes but gives synchronous generation owners the canonical longer lease", () => {
    expect(recovery).toContain("const DEFAULT_STALE_MS = 5 * 60 * 1000");
    expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
    expect(recovery).toContain("const GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");
    expect(recovery).toMatch(/recoverAgentInboundDispatcherClaims\(\s*supabaseAdmin,\s*DEFAULT_STALE_MS/);
    expect(recovery).toMatch(/recoverStaleAgentConversationLocks\(\s*supabaseAdmin,\s*GENERATION_LOCK_STALE_MS/);
  });

  it("keeps the recovery horizon above the canonical maximum aggregate funnel delay", () => {
    expect(funnelPlan).toMatch(/Math\.min\(\s*180,\s*Number\.isFinite/);
    const orderMatch = funnelPlan.match(/WELCOME_FUNNEL_STEP_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(orderMatch).not.toBeNull();
    const canonicalOrder = Array.from(
      orderMatch![1].matchAll(/"(welcome_text|audio|panel_text|video|services_text)"/g),
      (match) => match[1],
    );
    expect(canonicalOrder).toEqual(["welcome_text","audio","panel_text","video","services_text"]);
    expect(funnelRunner).toContain("WELCOME_FUNNEL_STEP_ORDER as ORDER");
    // 5 canonical steps * 180s = 15min, below the 20min generation-lock lease.
    expect(5 * 180 * 1000).toBeLessThan(20 * 60 * 1000);
  });
});