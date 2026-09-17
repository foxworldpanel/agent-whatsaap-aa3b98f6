import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts","utf8");
describe("Welcome Funnel webhook gate",()=>{
 it("checks the durable conversation barrier before trigger discovery",()=>{
  const barrier=source.indexOf("getWelcomeFunnelConversationBarrier");
  const query=source.indexOf('from("welcome_funnels")');
  expect(barrier).toBeGreaterThanOrEqual(0);
  expect(query).toBeGreaterThan(barrier);
  expect(source).toContain('status:"conversation_blocked"');
  expect(source).toContain('result.status==="query_unavailable"||result.status==="conversation_blocked"');
 });
 it("loads only scoped enabled funnels and delegates ownership to durable orchestrator",()=>{
  expect(source).toContain('.eq("user_id",params.userId)');
  expect(source).toContain('.eq("workspace_id",params.workspaceId)');
  expect(source).toContain('.eq("whatsapp_number_id",params.whatsappNumberId)');
  expect(source).toContain('.eq("enabled",true)');
  expect(source).toContain("orchestrateWelcomeFunnel");
  expect(source).not.toContain("welcome_funnel_runs");
  expect(source).not.toContain("agent_generation_locks");
 });
 it("never lets a newly completed, busy, quarantined or uncertain funnel fall through to Agent",()=>{
  expect(source).toContain('status==="query_unavailable"');
  expect(source).toContain('status==="completed"');
  expect(source).toContain('status==="blocked"');
  expect(source).toContain('status==="busy"');
 });
 it("does not treat generic greetings as funnel triggers",()=>{
  expect(source).toContain('new Set(["oi","ola","bom dia","boa tarde","boa noite"])');
 });
});
