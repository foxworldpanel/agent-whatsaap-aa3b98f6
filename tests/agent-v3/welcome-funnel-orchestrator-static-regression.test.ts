import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/welcome-funnel-orchestrator.server.ts","utf8");
describe("Welcome Funnel durable orchestrator",()=>{
 it("classifies before and after exact-holder conversation ownership",()=>{
  expect(source.match(/classifyWelcomeFunnelExecution/g)?.length).toBeGreaterThanOrEqual(3);
  expect(source).toContain("acquireAgentConversationLock");
  expect(source).toContain("startAgentConversationLockHeartbeat");
  expect(source).toContain("releaseAgentConversationLock");
  expect(source).toContain("randomUUID()");
 });
 it("never treats uncertain durable states as permission to start",()=>{
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(initial)");
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(fenced)");
  expect(source).toContain("mayStartWelcomeFunnelExecution(fenced)");
  expect(source).toContain('terminal!=="durable_completed"');
 });
});
