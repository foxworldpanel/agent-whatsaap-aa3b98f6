import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914524500_stage_b_direct_claim_funnel_barrier.sql","utf8");
describe("direct Stage B claim Funnel barrier",()=>{
 it("discovers the durable workspace and serializes on seed 31",()=>{expect(sql).toContain("SELECT conversation_id,workspace_id INTO v_conversation_id,v_workspace_id");expect(sql).toContain("hashtextextended(v_conversation_id::text,31)");});
 it("fails closed behind the shared Funnel routing barrier",()=>{expect(sql).toContain("public.has_welcome_funnel_agent_barrier(v_conversation_id,v_workspace_id)");expect(sql).toContain("NOT public.has_welcome_funnel_agent_barrier(j.conversation_id,j.workspace_id)");});
 it("does not claim across another runtime or generation owner",()=>{expect(sql).toContain("t.state IN('processing_safe','processing')");expect(sql).toContain("g.conversation_id=v_conversation_id");expect(sql).toContain("agent_customer_turn_messages");});
});
