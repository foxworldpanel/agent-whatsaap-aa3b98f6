import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914403000_stage_b_claim_skips_welcome_funnel.sql","utf8");
describe("Stage B claimant skips Welcome Funnel barriers",()=>{it("skips funnel-owned conversations in quarantine and claim passes",()=>{
 expect(sql.match(/welcome_funnel_execution_state/g)?.length).toBeGreaterThanOrEqual(6);
 expect(sql).toContain("s.status IN ('running','needs_review')");
 expect(sql.match(/pg_try_advisory_xact_lock/g)?.length).toBe(2);
 expect(sql.match(/LIMIT 64/g)?.length).toBe(2);
 expect(sql).toContain("j.attempt_count<p_max_attempts");
});});
