import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914243000_bound_orphan_generation_lock_recovery.sql"),
  "utf8",
);

describe("orphan generation lock recovery bounds", () => {
  it("bounds each recovery transaction and skips live conversation contention", () => {
    expect(migration).toContain("ORDER BY acquired_at,conversation_id");
    expect(migration).toContain("LIMIT 100");
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("revalidates exact stale ownership and preserves active durable owners", () => {
    expect(migration).toContain("l.holder=v_candidate.holder");
    expect(migration).toContain("l.acquired_at=v_candidate.acquired_at");
    expect(migration).toContain("active_job.status IN ('processing_safe','processing')");
    expect(migration).toContain("active_turn.state IN ('processing_safe','processing')");
  });
});
