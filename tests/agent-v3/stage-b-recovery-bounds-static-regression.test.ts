import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914264500_stage_b_recovery_fairness.sql"),
  "utf8",
);

describe("Stage B stale recovery", () => {
  it("orders stale conversations by age and looks beyond lock contention", () => {
    expect(sql).toContain("min(j.claimed_at) AS oldest_claimed_at");
    expect(sql).toContain("ORDER BY grouped.oldest_claimed_at,grouped.conversation_id");
    expect(sql).toContain("LIMIT 500");
    expect(sql).toContain("EXIT WHEN v_locked>=100");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("v_locked:=v_locked+1");
    expect(sql).toContain("CONTINUE;");
    expect(sql).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("preserves safe retry and unsafe quarantine semantics", () => {
    expect(sql).toContain("j.status='processing_safe'");
    expect(sql).toContain("j.attempt_count>=p_max_attempts");
    expect(sql).toContain("THEN 'needs_review' ELSE 'pending'");
    expect(sql).toContain("j.status='processing'");
    expect(sql).toContain("external side effect uncertain");
  });

  it("does not delete generation ownership while durable work remains active", () => {
    expect(sql).toContain("DELETE FROM public.agent_generation_locks");
    expect(sql).toContain("active.status IN ('processing_safe','processing')");
    expect(sql).toContain("active_turn.state IN ('processing_safe','processing')");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.recover_stale_agent_inbound_jobs(timestamptz,integer) TO service_role");
  });
});
