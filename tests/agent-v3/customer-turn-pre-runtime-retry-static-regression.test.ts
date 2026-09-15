import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = read("supabase/migrations/20260914290000_retry_pre_runtime_customer_turn_failures.sql");
const dispatcher = read("src/lib/agent-v3/customer-turn-dispatch.server.ts");
const turns = read("src/lib/agent-v3/customer-turn.server.ts");

describe("Customer Turn pre-runtime retry boundary", () => {
  it("releases only processing_safe ownership under the shared conversation fence", () => {
    expect(sql).toContain("state='processing_safe' AND claimed_by=p_holder");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).not.toContain("state='processing' AND claimed_by=p_holder");
  });

  it("retries safe failures until the bounded fifth claim then quarantines", () => {
    expect(sql).toContain("CASE WHEN v_attempts>=5 THEN 'needs_review' ELSE 'retry_safe' END");
    expect(sql).toContain("customer turn exhausted safe pre-runtime retries");
    expect(turns).toContain("release_agent_customer_turn_safe");
  });

  it("uses safe release for input construction failures but quarantine after runtime begins", () => {
    expect(dispatcher).toContain("buildCustomerTurnRuntimeInput");
    expect(dispatcher).toContain("releaseCustomerTurnSafe(s,turn.id,holder,error)");
    const enter = dispatcher.indexOf("enterCustomerTurnRuntime(s,turn.id,holder)");
    const runtime = dispatcher.indexOf("executeAgentV3Runtime(s,runtime.input)");
    const quarantine = dispatcher.indexOf("quarantineClaimedCustomerTurn(s,turn,holder,error)", runtime);
    expect(enter).toBeGreaterThan(-1);
    expect(runtime).toBeGreaterThan(enter);
    expect(quarantine).toBeGreaterThan(runtime);
  });
});
