import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recovery = readFileSync(resolve(process.cwd(), "src/routes/api/public/hooks/agent-inbound-recovery.ts"), "utf8");
const lock = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/conversation-lock.server.ts"), "utf8");
const funnel = readFileSync(resolve(process.cwd(), "src/lib/welcome-funnel-runner.server.ts"), "utf8");

describe("generation lock recovery lease horizon", () => {
  it("keeps durable Stage B recovery at five minutes but gives synchronous generation owners the canonical longer lease", () => {
    expect(recovery).toContain("const DEFAULT_STALE_MS = 5 * 60 * 1000");
    expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
    expect(recovery).toContain("const GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");
    expect(recovery).toMatch(/recoverAgentInboundDispatcherClaims\(\s*supabaseAdmin,\s*DEFAULT_STALE_MS/);
    expect(recovery).toMatch(/recoverStaleAgentConversationLocks\(\s*supabaseAdmin,\s*GENERATION_LOCK_STALE_MS/);
  });

  it("keeps the recovery horizon above the configured maximum aggregate funnel delay", () => {
    expect(funnel).toMatch(/Math\.min\(180,\s*sec\)/);
    expect(funnel).toContain('"welcome_text"');
    expect(funnel).toContain('"audio"');
    expect(funnel).toContain('"panel_text"');
    expect(funnel).toContain('"video"');
    expect(funnel).toContain('"services_text"');
  });
});
