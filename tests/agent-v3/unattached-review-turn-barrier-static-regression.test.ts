import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914300000_unattached_review_blocks_customer_turn.sql"), "utf8");
const dispatcher = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/customer-turn-dispatch.server.ts"), "utf8");

describe("unattached needs_review semantic barrier", () => {
  it("blocks collecting claims and readiness behind unattached review jobs", () => {
    expect(migration).toContain("review_job.status='needs_review'");
    expect(migration.match(/review_job\.status='needs_review'/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=review_job.id)");
    expect(migration).toContain("t.state='retry_safe'");
  });

  it("quarantines collecting turns instead of silently executing incomplete semantic input", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.quarantine_customer_turns_with_unattached_review");
    expect(migration).toContain("SET state='needs_review'");
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(migration).toContain("unattached inbound job requires review before semantic execution");
  });

  it("runs the quarantine after attachment and before claims", () => {
    const attach = dispatcher.indexOf("attachPendingAgentInboundJobsToCustomerTurns");
    const quarantine = dispatcher.lastIndexOf("quarantineCustomerTurnsWithUnattachedReview");
    const loop = dispatcher.indexOf("for(let attempt=0");
    expect(attach).toBeGreaterThan(-1);
    expect(quarantine).toBeGreaterThan(attach);
    expect(loop).toBeGreaterThan(quarantine);
    expect(dispatcher).toContain("quarantinedIncomplete");
  });
});
