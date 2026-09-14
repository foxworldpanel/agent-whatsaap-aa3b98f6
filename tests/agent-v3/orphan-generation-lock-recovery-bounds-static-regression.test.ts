import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914263000_orphan_generation_lock_recovery_fairness.sql"),
  "utf8",
);

describe("orphan generation lock recovery bounds", () => {
  it("looks beyond contention while bounding acquired conversation fences", () => {
    expect(migration).toContain("ORDER BY acquired_at,conversation_id");
    expect(migration).toContain("LIMIT 500");
    expect(migration).toContain("EXIT WHEN v_locked>=100");
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(migration).toContain("v_locked:=v_locked+1");
  });

  it("revalidates exact stale ownership and preserves active durable owners", () => {
    expect(migration).toContain("l.holder=v_candidate.holder");
    expect(migration).toContain("l.acquired_at=v_candidate.acquired_at");
    expect(migration).toContain("active_job.status IN ('processing_safe','processing')");
    expect(migration).toContain("active_turn.state IN ('processing_safe','processing')");
  });
});
