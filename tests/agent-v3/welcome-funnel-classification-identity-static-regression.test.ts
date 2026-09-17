import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914501500_welcome_funnel_classification_identity_guard.sql","utf8");const gate=readFileSync("src/lib/welcome-funnel-execution-gate.server.ts","utf8");const orch=readFileSync("src/lib/welcome-funnel-orchestrator.server.ts","utf8");
describe("Welcome Funnel classification identity",()=>{
 it("requires conversation and workspace identity",()=>{expect(sql).toContain("v_conversation_id IS DISTINCT FROM p_conversation_id");expect(sql).toContain("v_workspace_id IS DISTINCT FROM p_workspace_id");expect(sql).toContain("durable_identity_mismatch");});
 it("retires service-role execution of the ambiguous two-argument classifier",()=>{expect(sql).toContain("classify_welcome_funnel_execution(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role");});
 it("blocks Agent on durable identity mismatch",()=>{expect(gate).toContain('state==="durable_identity_mismatch"');expect(orch).toContain('"durable_identity_mismatch"');});
 it("propagates routing identity at every classification",()=>{expect(orch).toContain("conversationId:p.conversationId,workspaceId:p.workspaceId");expect(gate).toContain("p_conversation_id:conversationId,p_workspace_id:workspaceId");});
});
