import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914294500_bound_pending_drain_per_conversation.sql"),
  "utf8",
);

describe("pending Stage B attachment fairness by conversation", () => {
  it("chooses one oldest representative per conversation before taking its fence", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id) j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY candidate.created_at,candidate.id");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31))");
  });

  it("drains a bounded burst so one hot conversation cannot consume the whole sweep", () => {
    expect(sql).toContain("v_per_conversation integer:=least(16,greatest(1,ceil(v_target::numeric/4)::integer))");
    expect(sql).toContain("v_conversation_count:=0");
    expect(sql).toContain("EXIT WHEN v_count>=v_target OR v_conversation_count>=v_per_conversation");
    expect(sql).toContain("v_conversation_count:=v_conversation_count+1");
    expect(sql).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(sql).toContain("ON CONFLICT (job_id) DO NOTHING");
  });

  it("revalidates runtime owners while the shared conversation fence remains held", () => {
    expect(sql.match(/active_job\.status IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql.match(/active_turn\.state IN \('retry_safe','processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql.match(/public\.agent_generation_locks generation_lock/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("IF v_turn IS NOT NULL AND v_conversation_count>0 THEN");
  });
});
