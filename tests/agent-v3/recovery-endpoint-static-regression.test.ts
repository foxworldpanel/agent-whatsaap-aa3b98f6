import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = source("src/routes/api/public/hooks/agent-inbound-recovery.ts");
const recoveryHelper = source("src/lib/agent-v3/inbound-recovery.server.ts");
const lockHelper = source("src/lib/agent-v3/conversation-lock.server.ts");
const orphanRecovery = source("supabase/migrations/20260914443000_generation_lock_recovery_respects_welcome_funnel.sql");

describe("durable recovery endpoint", () => {
  it("authenticates before loading the service-role client", () => {
    const auth = route.indexOf("assertCronAuthorized(request)");
    const adminImport = route.indexOf('await import("@/integrations/supabase/client.server")');
    expect(auth).toBeGreaterThan(-1);
    expect(adminImport).toBeGreaterThan(auth);
    expect(route).toContain("POST: async");
    expect(route).not.toContain("GET: async");
  });

  it("recovers ownership through a recovery-only dependency graph", () => {
    expect(route).toContain('from "@/lib/agent-v3/inbound-recovery.server"');
    expect(route).not.toContain("inbound-job-dispatch.server");
    expect(route).toContain("recoverAgentInboundDispatcherClaims");
    expect(route).toContain("recoverStaleAgentConversationLocks");
    expect(route).not.toContain("executeAgentV3Runtime");
    expect(route).not.toContain("runAgentV3Turn");

    expect(recoveryHelper).toContain("recoverStaleAgentInboundJobs");
    expect(recoveryHelper).not.toContain("runtime.server");
    expect(recoveryHelper).not.toContain("inbound-runtime-claim.server");
    expect(recoveryHelper).not.toContain("dispatchOneAgentInbound");
    expect(lockHelper).toContain('"recover_stale_agent_generation_locks"');
  });

  it("fences orphan-lock cleanup behind a nonblocking shared lock and all active durable owners", () => {
    expect(orphanRecovery).toContain("recover_stale_agent_generation_locks");
    expect(orphanRecovery).toContain("LIMIT 100");
    expect(orphanRecovery).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(orphanRecovery).toContain("CONTINUE;");
    expect(orphanRecovery).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(orphanRecovery).toContain("active_job.status IN ('processing_safe','processing')");
    expect(orphanRecovery).toContain("active_turn.state IN ('processing_safe','processing')");
    expect(orphanRecovery).toContain("funnel.status='running'");
    expect(orphanRecovery).toContain("GRANT EXECUTE ON FUNCTION public.recover_stale_agent_generation_locks(timestamptz) TO service_role");
  });
});
