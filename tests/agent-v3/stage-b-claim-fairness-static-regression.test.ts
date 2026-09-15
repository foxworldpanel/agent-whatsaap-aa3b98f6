import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914281500_stage_b_claim_generation_lock_fence.sql"),
  "utf8",
);
const background = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job"));

describe("legacy Stage B background claim fairness", () => {
  it("skips contended conversations instead of blocking the whole queue", () => {
    expect(background).toContain("FOR v_candidate IN");
    expect(background).toContain("LIMIT 32");
    expect(background).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(background).toContain("CONTINUE;");
    expect(background).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("preserves all durable conversation ownership fences", () => {
    expect(background.match(/t\.state IN \('retry_safe','processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(background.match(/active\.status IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(background.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(background).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)");
    expect(background).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
