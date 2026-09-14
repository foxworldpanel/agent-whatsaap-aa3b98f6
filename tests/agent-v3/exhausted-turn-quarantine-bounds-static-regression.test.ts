import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914271500_exhausted_turn_quarantine_fairness.sql"),
  "utf8",
);

describe("exhausted Customer Turn quarantine", () => {
  it("looks beyond contention while bounding acquired conversation fences", () => {
    expect(sql).toContain("LIMIT 500");
    expect(sql).toContain("EXIT WHEN v_locked>=100");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("v_locked:=v_locked+1");
    expect(sql).toContain("CONTINUE;");
    expect(sql).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("quarantines both the exhausted turn and its still-pending Stage B members", () => {
    expect(sql).toContain("state='retry_safe' AND safe_attempt_count>=5");
    expect(sql).toContain("SET state='needs_review'");
    expect(sql).toContain("customer turn exhausted safe pre-runtime attempts");
    expect(sql).toContain("AND j.status='pending'");
  });
});
