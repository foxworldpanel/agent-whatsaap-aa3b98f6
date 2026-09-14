import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8");
const recovery = read("20260914270000_customer_turn_recovery_fairness.sql");
const quarantine = read("20260914271500_exhausted_turn_quarantine_fairness.sql");

describe("Customer Turn background sweep fairness", () => {
  for (const [name, sql] of [["stale recovery", recovery], ["exhausted quarantine", quarantine]] as const) {
    it(`${name} looks beyond contention while bounding acquired fences`, () => {
      expect(sql).toContain("LIMIT 500");
      expect(sql).toContain("EXIT WHEN v_locked>=100");
      expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
      expect(sql).toContain("v_locked:=v_locked+1");
    });
  }

  it("keeps stale runtime-active turns quarantined rather than replayed", () => {
    expect(recovery).toContain("SET state='needs_review'");
    expect(recovery).toContain("state='processing'");
    expect(recovery).toContain("claimed_by IS NOT DISTINCT FROM v_candidate.claimed_by");
    expect(recovery).toContain("claimed_at IS NOT DISTINCT FROM v_candidate.claimed_at");
  });

  it("quarantines pending member jobs with an exhausted retry_safe turn", () => {
    expect(quarantine).toContain("state='retry_safe' AND safe_attempt_count>=5");
    expect(quarantine).toContain("SET status='needs_review'");
    expect(quarantine).toContain("AND j.status='pending'");
  });
});
