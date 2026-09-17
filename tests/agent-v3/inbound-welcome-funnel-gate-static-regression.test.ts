import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/agent-v3/inbound-welcome-funnel-gate.server.ts","utf8");
describe("Welcome Funnel aware inbound durability",()=>{
 it("reads the durable conversation barrier before Customer Turn attachment",()=>{
  expect(source).toContain("getWelcomeFunnelConversationBarrier");
  expect(source).toContain("welcomeFunnelBlocksAgentRuntime(barrier)");
 });
 it("persists blocked messages as Stage B work instead of dropping them",()=>{
  expect(source).toContain("persistWebhookAgentInboundJob");
  expect(source).toContain('status:"pending_behind_funnel"');
 });
 it("attaches only after the barrier is clear",()=>{
  expect(source.indexOf("welcomeFunnelBlocksAgentRuntime(barrier)")).toBeLessThan(source.indexOf("beginWebhookAgentInboundRuntime"));
  expect(source).toContain('barrier:"clear"');
 });
});
