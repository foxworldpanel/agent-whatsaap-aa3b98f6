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
 it("proves the lease before and after the external-side-effect window",()=>{
  expect(source.match(/refreshAgentConversationLock/g)?.length).toBeGreaterThanOrEqual(3);
  expect(source).toContain("leaseConfirmed");
  expect(source).toContain("leaseStillOwned");
  expect(source).toContain("if(leaseError) throw leaseError");
 });
 it("keeps legacy runs as append-only history without making them execution authority",()=>{
  expect(source).toContain("createLegacyHistoryClaim");
  expect(source).toContain('.from("welcome_funnel_runs").insert');
  expect(source).not.toContain('.from("welcome_funnel_runs").delete');
  expect(source.indexOf("await createLegacyHistoryClaim")).toBeLessThan(source.indexOf("await runWelcomeFunnelSequence"));
 });
 it("never upgrades historical compatibility into proof of delivery",()=>{
  expect(source).toContain('status:"historical_compatible"');
  expect(source).not.toContain('status:"already_completed",classification:initial};\n if(blocksAutomatic');
  expect(source).toContain('initial==="legacy_compatible"');
  expect(source).toContain('fenced==="legacy_compatible"');
 });
 it("never treats uncertain durable states as permission to start",()=>{
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(initial)");
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(fenced)");
  expect(source).toContain("mayStartWelcomeFunnelExecution(fenced)");
  expect(source).toContain('terminal!=="durable_completed"');
 });
});
