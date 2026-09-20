import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const compatibility=readFileSync("supabase/migrations/20260914423000_stage_b_canonical_claim_entrypoint.sql","utf8");
const finalClaim=readFileSync("supabase/migrations/20260914511500_stage_b_claim_funnel_workspace_identity.sql","utf8");
const barrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("Stage B canonical claim RPC",()=>{
 it("routes the compatibility service-role entrypoint through the fenced claimant with the real max-attempt bound",()=>{expect(compatibility).toContain("FROM public.claim_next_agent_inbound_job_fenced(p_holder, p_max_attempts)");expect(compatibility).not.toContain("2147483647");expect(compatibility).not.toContain("SET status='needs_review'");});
 it("keeps the compatibility RPC private to service_role",()=>{expect(compatibility).toContain("REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer)");expect(compatibility).toContain("GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer)");expect(compatibility).toContain("TO service_role");});
 it("final fenced claimant owns exhaustion, fairness and processing_safe transition",()=>{expect(finalClaim).toContain("j.attempt_count>=p_max_attempts");expect(finalClaim).toContain("status='needs_review'");expect(finalClaim).toContain("j.attempt_count<p_max_attempts");expect(finalClaim).toContain("status='processing_safe'");expect(finalClaim).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");});
 it("final claim path inherits full current-user Funnel routing fence",()=>{expect(finalClaim).toContain("public.has_welcome_funnel_agent_barrier");expect(barrier).toContain("IF NOT FOUND OR v_user_id IS NULL THEN RETURN true");expect(barrier).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");expect(barrier).toContain("s.user_id IS DISTINCT FROM v_user_id");});
});
