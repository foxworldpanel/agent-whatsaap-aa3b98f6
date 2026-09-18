import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dispatcher = readFileSync(
  resolve(process.cwd(), "src/lib/agent-v3/customer-turn-dispatch.server.ts"),
  "utf8",
);
const scheduler = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914184500_schedule_agent_customer_turn_workers.sql"),
  "utf8",
);

describe("Customer Turn cron dispatch runtime budget", () => {
  it("keeps the claim loop below the scheduler request timeout", () => {
    expect(dispatcher).toContain("AGENT_CUSTOMER_TURN_BATCH_BUDGET_MS = 35_000");
    expect(dispatcher).toContain("const startedAt=Date.now()");
    expect(dispatcher).toContain("if(Date.now()-startedAt>=budgetMs)break");
    expect(scheduler).toContain("timeout_milliseconds := 55000");
  });

  it("does not allow callers to expand the safety budget", () => {
    expect(dispatcher).toContain("Math.min(maxBatchMs,AGENT_CUSTOMER_TURN_BATCH_BUDGET_MS)");
    expect(dispatcher).toContain("Math.min(maxPerRun,20)");
  });

  it("still reports durable readiness after a budget stop", () => {
    expect(dispatcher).toContain("const readyRemains=withinBudget()?await hasReadyCustomerTurn(s):true");
    expect(dispatcher).toContain("idle:!readyRemains");
  });
});
