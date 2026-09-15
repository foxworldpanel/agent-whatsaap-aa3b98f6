import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dispatcher=readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts","utf8");
const scheduler=readFileSync("supabase/migrations/20260914184500_schedule_agent_customer_turn_workers.sql","utf8");

describe("Customer Turn cron runtime start reserve",()=>{
 it("stops before claiming fresh work when the safe start window is gone",()=>{
  expect(dispatcher).toContain("AGENT_CUSTOMER_TURN_BATCH_BUDGET_MS = 35_000");
  expect(dispatcher).toContain("AGENT_CUSTOMER_TURN_RUNTIME_START_RESERVE_MS = 15_000");
  expect(dispatcher).toContain("if(!canStartRuntime())break");
  expect(dispatcher.indexOf("if(!canStartRuntime())break")).toBeLessThan(dispatcher.indexOf("const result=await dispatchOneCustomerTurn"));
  expect(scheduler).toContain("timeout_milliseconds := 55000");
 });
});
