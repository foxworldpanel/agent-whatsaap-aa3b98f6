import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Customer Turn burst barrier migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261002012731_restore_customer_turn_pending_burst_barrier.sql"), "utf8");

  it("keeps collecting turns open while pending inbound is unattached", () => {
    expect(migration).toContain("pending_job.status='pending'");
    expect(migration).toContain("agent_customer_turn_messages tm WHERE tm.job_id=pending_job.id");
    expect(migration.match(/pending_job\.status='pending'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("preserves review, retry cooldown, and Welcome Funnel barriers", () => {
    expect(migration).toContain("agent_turn_has_blocking_unattached_review");
    expect(migration).toContain("t.updated_at<=now()-interval '15 seconds'");
    expect(migration).toContain("has_welcome_funnel_agent_barrier");
  });
});
