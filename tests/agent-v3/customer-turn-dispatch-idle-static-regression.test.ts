import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const dispatcher = source("src/lib/agent-v3/customer-turn-dispatch.server.ts");
const customerTurn = source("src/lib/agent-v3/customer-turn.server.ts");
const readiness = source("supabase/migrations/20260914231500_customer_turn_ready_probe.sql");

describe("Agent V3 Customer Turn dispatcher idle semantics", () => {
  it("reports idle from durable readiness rather than claim collisions", () => {
    expect(dispatcher).toContain("hasReadyCustomerTurn");
    expect(dispatcher).toContain("const durableIdle = !(await hasReadyCustomerTurn(s))");
    expect(dispatcher).toContain("idle: durableIdle");
    expect(dispatcher).not.toContain("idle: claimed < bounded");
  });

  it("keeps the readiness probe aligned with retry ordering and safe-attempt bounds", () => {
    expect(customerTurn).toContain('s.rpc("has_ready_agent_customer_turn"');
    expect(readiness).toContain("t.safe_attempt_count<5");
    expect(readiness).toContain("older.state='retry_safe'");
    expect(readiness).toContain("(older.created_at,older.id)<(t.created_at,t.id)");
    expect(readiness).toContain("t.last_received_at<=p_quiet_before");
    expect(readiness).toContain("GRANT EXECUTE ON FUNCTION public.has_ready_agent_customer_turn(timestamptz) TO service_role");
  });
});
