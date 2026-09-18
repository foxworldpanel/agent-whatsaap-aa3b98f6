import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const claim=readFileSync("supabase/migrations/20260914510000_background_claim_funnel_workspace_identity.sql","utf8");
const barrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("Customer Turn claimant skips final Welcome Funnel barriers",()=>{it("filters before and revalidates after seed-31 fence through the centralized full-routing barrier",()=>{
 const lock=claim.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
 expect(lock).toBeGreaterThanOrEqual(0);
 expect(claim.indexOf("has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)")).toBeLessThan(lock);
 expect(claim.indexOf("has_welcome_funnel_agent_barrier(v_candidate.conversation_id,v_candidate.workspace_id)")).toBeGreaterThan(lock);
 expect(claim).toContain("LIMIT 32");
 expect(barrier).toContain("c.id=p_conversation_id AND c.workspace_id=p_workspace_id");
 expect(barrier).toContain("s.user_id IS DISTINCT FROM v_user_id");
 expect(barrier).toContain("s.status IN('running','needs_review')");
});});
