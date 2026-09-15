import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914283000_pending_inbound_blocks_customer_turn_claim.sql"),
  "utf8",
);

describe("Customer Turn background claim contention", () => {
  it("does not block the queue scan behind one conversation advisory fence", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn");
    expect(migration).toContain("FOR v_candidate IN");
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(migration).toContain("CONTINUE;");
    expect(migration).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("still revalidates all durable runtime owners after acquiring the fence", () => {
    expect(migration).toContain("a.state IN ('processing_safe','processing')");
    expect(migration).toContain("j.status IN ('processing_safe','processing')");
    expect(migration).toContain("FROM public.agent_generation_locks g");
    expect(migration).toContain("IF FOUND THEN RETURN; END IF;");
  });

  it("does not claim collecting work while pending inbound remains unattached", () => {
    expect(migration).toContain("pending_job.status='pending'");
    expect(migration).toContain("agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id");
  });
});
