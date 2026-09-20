import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const historical=readFileSync("supabase/migrations/20260914300000_unattached_review_blocks_customer_turn.sql","utf8");
const finalClaim=readFileSync("supabase/migrations/20260914510000_background_claim_funnel_workspace_identity.sql","utf8");
const finalBarrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("inbound Customer Turn claim barriers",()=>{
 it("historically blocks collecting while pending jobs remain unattached and review ingress is incomplete",()=>{expect(historical.match(/pending_job\.status='pending'/g)?.length??0).toBeGreaterThanOrEqual(5);expect(historical.match(/review_job\.status='needs_review'/g)?.length??0).toBeGreaterThanOrEqual(4);expect(historical).toContain("quarantine_customer_turns_with_unattached_review");});
 it("keeps retry_safe sealed, cooled down and ahead of later arrivals",()=>{expect(historical).toContain("t.state='retry_safe'");expect(historical).toContain("older.state='retry_safe'");expect(historical).toContain("t.updated_at<=now()-interval '15 seconds'");});
 it("final background claim/readiness preserve active Stage B, Customer Turn and generation ownership fences",()=>{expect(finalClaim).toContain("a.state IN('processing_safe','processing')");expect(finalClaim).toContain("j.status IN('processing_safe','processing')");expect(finalClaim).toContain("agent_generation_locks g");expect(finalClaim).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");});
 it("final claim/readiness inherit current-user Funnel routing barrier",()=>{expect(finalClaim).toContain("has_welcome_funnel_agent_barrier");expect(finalBarrier).toContain("IF NOT FOUND OR v_user_id IS NULL THEN RETURN true");expect(finalBarrier).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(finalBarrier).toContain("s.status IN('running','needs_review')");});
});
