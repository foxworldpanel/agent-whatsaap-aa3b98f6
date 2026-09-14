import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914244500_customer_turn_recovery_nonblocking.sql"),
  "utf8",
);

describe("Customer Turn stale recovery", () => {
  it("bounds each recovery transaction and skips live conversation contention", () => {
    expect(sql).toContain("ORDER BY claimed_at,id");
    expect(sql).toContain("LIMIT 100");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
  });

  it("preserves the safe/unsafe crash boundary with exact stale-claim revalidation", () => {
    expect(sql).toContain("WHEN safe_attempt_count>=5 THEN 'needs_review' ELSE 'retry_safe'");
    expect(sql).toContain("state='processing_safe'");
    expect(sql).toContain("state='processing'");
    expect(sql).toContain("SET state='needs_review'");
    expect(sql).toContain("claimed_by IS NOT DISTINCT FROM v_candidate.claimed_by");
    expect(sql).toContain("claimed_at IS NOT DISTINCT FROM v_candidate.claimed_at");
  });
});
