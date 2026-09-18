import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const workspace=readFileSync("supabase/migrations/20260914510000_background_claim_funnel_workspace_identity.sql","utf8");
const identity=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("background Customer Turn Funnel routing fence",()=>{
 it("final barrier resolves and enforces full routing identity",()=>{
  expect(identity).toContain("has_welcome_funnel_agent_barrier");
  expect(identity).toContain("c.id=p_conversation_id AND c.workspace_id=p_workspace_id");
  expect(identity).toContain("IF NOT FOUND OR v_user_id IS NULL THEN RETURN true");
  expect(identity).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");
  expect(identity).toContain("s.user_id IS DISTINCT FROM v_user_id");
  expect(identity).toContain("s.status IN('running','needs_review')");
 });
 it("background claim uses the centralized barrier before and after seed-31 candidate fence",()=>{
  const lock=workspace.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  expect(workspace.indexOf("has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)")).toBeLessThan(lock);
  expect(workspace.indexOf("has_welcome_funnel_agent_barrier(v_candidate.conversation_id,v_candidate.workspace_id)")).toBeGreaterThan(lock);
 });
 it("keeps readiness probe on the same centralized barrier",()=>{
  expect(workspace).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
  expect(workspace).toContain("NOT public.has_welcome_funnel_agent_barrier(t.conversation_id,t.workspace_id)");
 });
});
