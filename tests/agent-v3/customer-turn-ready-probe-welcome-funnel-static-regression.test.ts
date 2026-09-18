import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const claim=readFileSync("supabase/migrations/20260914510000_background_claim_funnel_workspace_identity.sql","utf8");
const barrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("Customer Turn readiness matches final Funnel fences",()=>{it("uses the centralized full-routing barrier and generation ownership",()=>{
 expect(claim).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
 expect(claim).toContain("NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)");
 expect(claim).toContain("agent_generation_locks");
 expect(claim).toContain("t.state='retry_safe'");
 expect(claim).toContain("t.state='collecting'");
 expect(barrier).toContain("s.user_id IS DISTINCT FROM v_user_id");
 expect(barrier).toContain("s.status IN('running','needs_review')");
});});
