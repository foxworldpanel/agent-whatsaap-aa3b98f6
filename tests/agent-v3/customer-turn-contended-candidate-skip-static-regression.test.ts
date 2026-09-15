import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914283000_pending_inbound_blocks_customer_turn_claim.sql"),
  "utf8",
);

describe("Customer Turn claim fairness", () => {
  it("scans multiple ready candidates and skips an advisory-lock collision", () => {
    expect(sql).toContain("FOR v_candidate IN");
    expect(sql).toContain("LIMIT 32");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
    expect(sql).not.toContain("IF NOT pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31)) THEN\n   RETURN;");
  });

  it("revalidates durable owners and stops only after a successful claim", () => {
    expect(sql).toContain("a.state IN ('processing_safe','processing')");
    expect(sql).toContain("j.status IN ('processing_safe','processing')");
    expect(sql).toContain("FROM public.agent_generation_locks g");
    expect(sql).toContain("IF FOUND THEN RETURN; END IF;");
  });

  it("skips collecting candidates with pending unattached inbound", () => {
    expect(sql).toContain("pending_job.status='pending'");
    expect(sql).toContain("agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id");
  });
});
