import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914264500_stage_b_recovery_fairness.sql"),
  "utf8",
);

describe("Stage B stale recovery fairness", () => {
  it("orders conversations by oldest stale claim and looks beyond contention", () => {
    expect(sql).toContain("min(j.claimed_at) AS oldest_claimed_at");
    expect(sql).toContain("ORDER BY grouped.oldest_claimed_at,grouped.conversation_id");
    expect(sql).toContain("LIMIT 500");
    expect(sql).toContain("EXIT WHEN v_locked>=100");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("preserves safe requeue and unsafe quarantine semantics", () => {
    expect(sql).toContain("WHEN j.attempt_count>=p_max_attempts THEN 'needs_review' ELSE 'pending'");
    expect(sql).toContain("j.status='processing_safe'");
    expect(sql).toContain("j.status='processing'");
    expect(sql).toContain("SET status='needs_review'");
  });
});
