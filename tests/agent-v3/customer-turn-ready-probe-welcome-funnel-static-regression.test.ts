import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const claim=readFileSync("supabase/migrations/20260914510000_background_claim_funnel_workspace_identity.sql","utf8");
const barrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("Customer Turn readiness matches final Funnel fences",()=>{
 it("uses centralized full-routing barrier for retry_safe and collecting readiness",()=>{expect(claim).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");expect(claim).toContain("NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)");expect(claim).toContain("t.state='retry_safe'");expect(claim).toContain("t.state='collecting'");});
 it("readiness stays false behind every concurrent runtime owner",()=>{expect(claim).toContain("a.state IN('processing_safe','processing')");expect(claim).toContain("j.status IN('processing_safe','processing')");expect(claim).toContain("agent_generation_locks g");});
 it("final barrier includes current user, workspace and uncertain Funnel state",()=>{expect(barrier).toContain("IF NOT FOUND OR v_user_id IS NULL THEN RETURN true");expect(barrier).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");expect(barrier).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(barrier).toContain("s.status IN('running','needs_review')");});
});
