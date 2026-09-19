import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const historical=readFileSync("supabase/migrations/20260914403000_stage_b_claim_skips_welcome_funnel.sql","utf8");
const claimant=readFileSync("supabase/migrations/20260914511500_stage_b_claim_funnel_workspace_identity.sql","utf8");
const finalBarrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("Stage B claimant skips Welcome Funnel barriers",()=>{
 it("keeps the historical claimant fair around Funnel ownership",()=>{expect(historical.match(/welcome_funnel_execution_state/g)?.length).toBeGreaterThanOrEqual(6);expect(historical).toContain("s.status IN ('running','needs_review')");expect(historical.match(/pg_try_advisory_xact_lock/g)?.length).toBe(2);expect(historical.match(/LIMIT 64/g)?.length).toBe(2);});
 it("uses the final identity-aware barrier before and after seed-31 acquisition",()=>{expect(claimant.match(/public\.has_welcome_funnel_agent_barrier/g)?.length??0).toBeGreaterThanOrEqual(6);expect(claimant.match(/pg_try_advisory_xact_lock/g)?.length).toBe(2);expect(claimant.match(/LIMIT 64/g)?.length).toBe(2);expect(claimant).toContain("j.attempt_count<p_max_attempts");expect(finalBarrier).toContain("SELECT c.user_id INTO v_user_id");expect(finalBarrier).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");expect(finalBarrier).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(finalBarrier).toContain("s.status IN('running','needs_review')");});
});
