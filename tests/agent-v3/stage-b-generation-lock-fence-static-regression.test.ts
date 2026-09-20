import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const historical=readFileSync("supabase/migrations/20260914281500_stage_b_claim_generation_lock_fence.sql","utf8");
const finalBackground=readFileSync("supabase/migrations/20260914511500_stage_b_claim_funnel_workspace_identity.sql","utf8");
const finalDirect=readFileSync("supabase/migrations/20260914524500_stage_b_direct_claim_funnel_barrier.sql","utf8");
describe("Stage B generation ownership fence",()=>{
 it("retains historical generation ownership coverage",()=>{expect(historical).toContain("public.agent_generation_locks g");expect(historical).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");});
 it("final background claimant checks generation ownership before and after nonblocking seed-31 fence",()=>{expect(finalBackground).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");expect(finalBackground.match(/agent_generation_locks g/g)?.length??0).toBeGreaterThanOrEqual(2);expect(finalBackground).toContain("j.attempt_count<p_max_attempts");});
 it("final direct claimant blocks generation ownership under the same seed-31 namespace",()=>{expect(finalDirect).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");expect(finalDirect.match(/agent_generation_locks g/g)?.length??0).toBeGreaterThanOrEqual(2);expect(finalDirect).toContain("status='processing_safe'");});
});
