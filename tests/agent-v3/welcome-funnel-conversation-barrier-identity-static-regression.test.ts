import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914503000_welcome_funnel_conversation_barrier_workspace_identity.sql","utf8");const barrier=readFileSync("src/lib/welcome-funnel-conversation-barrier.server.ts","utf8");const webhook=readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts","utf8");const inbound=readFileSync("src/lib/agent-v3/inbound-welcome-funnel-gate.server.ts","utf8");
describe("Welcome Funnel conversation barrier identity",()=>{
 it("fails closed on workspace mismatch",()=>{expect(sql).toContain("workspace_id IS DISTINCT FROM p_workspace_id");expect(sql).toContain("identity_mismatch");expect(barrier).toContain('"identity_mismatch"');});
 it("retires the one-argument barrier for service role",()=>{expect(sql).toContain("get_welcome_funnel_conversation_barrier(uuid) FROM PUBLIC,anon,authenticated,service_role");});
 it("passes workspace through webhook and pre-attachment recheck",()=>{expect(webhook).toContain("params.conversationId,params.workspaceId");expect(inbound).toContain("input.conversationId,input.workspaceId");});
});
