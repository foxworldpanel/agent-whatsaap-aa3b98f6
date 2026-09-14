import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = source("src/routes/api/public/hooks/agent-inbound-recovery.ts");
const lockHelper = source("src/lib/agent-v3/conversation-lock.server.ts");
const orphanRecovery = source("supabase/migrations/20260914240000_recover_orphan_generation_locks.sql");

describe("durable recovery endpoint", () => {
  it("authenticates before loading the service-role client", () => {
    const auth = route.indexOf("assertCronAuthorized(request)");
    const adminImport = route.indexOf('await import("@/integrations/supabase/client.server")');
    expect(auth).toBeGreaterThan(-1);
    expect(adminImport).toBeGreaterThan(auth);
    expect(route).toContain("POST: async");
    expect(route).not.toContain("GET: async");
  });

  it("recovers Stage B ownership and standalone generation locks without replaying runtime", () => {
    expect(route).toContain("recoverAgentInboundDispatcherClaims");
    expect(route).toContain("recoverStaleAgentConversationLocks");
    expect(route).not.toContain("executeAgentV3Runtime");
    expect(route).not.toContain("runAgentV3Turn");
    expect(lockHelper).toContain('"recover_stale_agent_generation_locks"');
  });

  it("fences orphan-lock cleanup behind the shared conversation lock and active durable owners", () => {
    expect(orphanRecovery).toContain("recover_stale_agent_generation_locks");
    expect(orphanRecovery).toContain("hashtextextended(v_candidate.conversation_id::text,31)");
    expect(orphanRecovery).toContain("active_job.status IN ('processing_safe','processing')");
    expect(orphanRecovery).toContain("active_turn.state IN ('processing_safe','processing')");
    expect(orphanRecovery).toContain("GRANT EXECUTE ON FUNCTION public.recover_stale_agent_generation_locks(timestamptz) TO service_role");
  });
});
