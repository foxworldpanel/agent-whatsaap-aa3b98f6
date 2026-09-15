import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source=readFileSync(resolve(process.cwd(),"src/lib/agent-v3/customer-turn-dispatch.server.ts"),"utf8");

describe("Customer Turn final readiness probe budget",()=>{
 it("does not perform the final DB probe after the batch budget is exhausted",()=>{
  expect(source).toContain("const readyRemains=withinBudget()?await hasReadyCustomerTurn(s):true");
 });
 it("conservatively reports non-idle when the final probe is skipped",()=>{
  expect(source).toContain("idle:!readyRemains");
 });
});
