import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914280000_stage_b_claim_skips_fenced_conversations.sql"),
  "utf8",
);

describe("legacy Stage B background claim fairness", () => {
  it("skips contended conversations instead of blocking the whole queue", () => {
    expect(sql).toContain("FOR v_candidate IN");
    expect(sql).toContain("LIMIT 32");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
    expect(sql).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });

  it("preserves semantic Customer Turn ownership and active Stage B exclusivity", () => {
    expect(sql.match(/t\.state IN \('retry_safe','processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(sql.match(/active\.status IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)");
    expect(sql).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
