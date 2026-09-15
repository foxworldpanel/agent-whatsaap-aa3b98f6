import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts","utf8");

describe("Customer Turn dispatcher maintenance budget",()=>{
 it("shares the same deadline across maintenance and claim phases",()=>{
  expect(source).toContain("const withinBudget=()=>Date.now()-startedAt<budgetMs");
  expect(source).toContain("if(withinBudget())recovered=await recoverStaleCustomerTurns(s)");
  expect(source).toContain("if(withinBudget())quarantinedExhausted=await quarantineExhaustedCustomerTurns(s)");
  expect(source).toContain("if(withinBudget())attached=await attachPendingAgentInboundJobsToCustomerTurns(s,maintenanceLimit)");
  expect(source).toContain("if(withinBudget())quarantinedIncomplete=await quarantineCustomerTurnsWithUnattachedReview(s,maintenanceLimit)");
  expect(source).toContain("if(!withinBudget())break");
 });

 it("bounds maintenance fanout from the same public max-per-run cap",()=>{
  expect(source).toContain("const maintenanceLimit=Math.max(20,Math.min(maxPerRun,20)*4)");
  expect(source).not.toContain("Math.max(20,maxPerRun*4)");
 });
});
