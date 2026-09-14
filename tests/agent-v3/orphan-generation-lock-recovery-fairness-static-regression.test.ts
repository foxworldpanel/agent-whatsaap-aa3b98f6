import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914263000_orphan_generation_lock_recovery_fairness.sql"),
  "utf8",
);

describe("orphan generation lock recovery fairness", () => {
  it("looks beyond a contended oldest batch while bounding acquired fences", () => {
    expect(sql).toContain("LIMIT 500");
    expect(sql).toContain("EXIT WHEN v_locked>=100");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("v_locked:=v_locked+1");
  });

  it("retains exact stale identity and active-owner protection", () => {
    expect(sql).toContain("l.holder=v_candidate.holder");
    expect(sql).toContain("l.acquired_at=v_candidate.acquired_at");
    expect(sql).toContain("active_job.status IN ('processing_safe','processing')");
    expect(sql).toContain("active_turn.state IN ('processing_safe','processing')");
  });
});
