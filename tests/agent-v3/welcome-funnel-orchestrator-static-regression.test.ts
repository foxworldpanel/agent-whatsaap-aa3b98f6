import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const source=readFileSync(
  "src/lib/welcome-funnel-orchestrator.server.ts",
  "utf8",
);

describe("Welcome Funnel durable orchestrator",()=>{
 it("classifies before and after exact-holder conversation ownership",()=>{
  expect(source.match(/classifyWelcomeFunnelExecution/g)?.length).toBeGreaterThanOrEqual(2);
  expect(source).toContain("acquireAgentConversationLock");
  expect(source).toContain("startAgentConversationLockHeartbeat");
  expect(source).toContain("releaseAgentConversationLock");
  expect(source).toContain("randomUUID()");
 });
 it("proves the lease before and after the external-side-effect window",()=>{
  expect(source).toContain("refreshAgentConversationLock");
  expect(source).toContain("assertExecutionOwnership");
  expect(source.match(/await assertExecutionOwnership\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  expect(source).toContain("if(leaseError)throw leaseError");
 });
 it("uses durable execution state as the sole modern claim",()=>{
  expect(source).toContain("await runWelcomeFunnelSequence");
  expect(source).not.toContain("createLegacyHistoryClaim");
  expect(source).not.toContain('.from("welcome_funnel_runs")');
 });
 it("never upgrades historical compatibility into proof of delivery",()=>{
  expect(source).toContain('status:"historical_compatible"');
  expect(source).toContain('initial==="legacy_compatible"');
  expect(source).toContain('fenced==="legacy_compatible"');
 });
 it("materializes an ambiguous legacy claim as a durable review fence",()=>{
  expect(source).toContain("quarantine_ambiguous_welcome_funnel_claim");
  expect(source).toContain('fenced==="legacy_ambiguous"');
  expect(source).toContain('quarantined!=="durable_needs_review"');
  expect(source.indexOf("acquireAgentConversationLock")).toBeLessThan(
    source.indexOf("quarantineLegacyAmbiguousClaim({"),
  );
 });
 it("never treats uncertain durable states as permission to start",()=>{
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(initial)");
  expect(source).toContain("blocksAutomaticAgentAfterFunnelClassification(fenced)");
  expect(source).toContain("mayStartWelcomeFunnelExecution(fenced)");
  expect(source).toContain('terminal!=="durable_completed"');
 });
});
