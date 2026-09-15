import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const releaseSql = read("supabase/migrations/20260914290000_retry_pre_runtime_customer_turn_failures.sql");
const claimSql = read("supabase/migrations/20260914291500_customer_turn_safe_retry_cooldown.sql");
const dispatcher = read("src/lib/agent-v3/customer-turn-dispatch.server.ts");
const turns = read("src/lib/agent-v3/customer-turn.server.ts");

describe("Customer Turn pre-runtime retry boundary", () => {
  it("releases only processing_safe ownership under the shared conversation fence", () => {
    expect(releaseSql).toContain("state='processing_safe' AND claimed_by=p_holder");
    expect(releaseSql).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    expect(releaseSql).toContain("FOR UPDATE");
    expect(releaseSql).not.toContain("state='processing' AND claimed_by=p_holder");
  });

  it("retries safe failures until the bounded fifth claim then quarantines", () => {
    expect(releaseSql).toContain("CASE WHEN v_attempts>=5 THEN 'needs_review' ELSE 'retry_safe' END");
    expect(releaseSql).toContain("customer turn exhausted safe pre-runtime retries");
    expect(turns).toContain("release_agent_customer_turn_safe");
  });

  it("immediately releases every confirmed pre-runtime failure path", () => {
    expect(dispatcher).toContain("releaseClaimedCustomerTurnSafe(s,turn,holder,error)");
    expect(dispatcher).toContain("if(!enteredRuntime)return releaseClaimedCustomerTurnSafe");
    const enter = dispatcher.indexOf("enterCustomerTurnRuntime(s,turn.id,holder)");
    const runtime = dispatcher.indexOf("executeAgentV3Runtime(s,runtime.input)");
    const quarantine = dispatcher.indexOf("quarantineClaimedCustomerTurn(s,turn,holder,error)", runtime);
    expect(enter).toBeGreaterThan(-1);
    expect(runtime).toBeGreaterThan(enter);
    expect(quarantine).toBeGreaterThan(runtime);
  });

  it("does not burn all safe attempts in one dispatcher burst", () => {
    expect(claimSql.match(/t\.updated_at<=now\(\)-interval '15 seconds'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(claimSql).toContain("current_turn.updated_at>now()-interval '15 seconds'");
    expect(claimSql).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
    expect(claimSql).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn");
    expect(claimSql).toContain("CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn");
  });

  it("keeps runtime failures quarantined rather than replayed", () => {
    const runtime = dispatcher.indexOf("executeAgentV3Runtime(s,runtime.input)");
    expect(dispatcher.indexOf("quarantineClaimedCustomerTurn(s,turn,holder,error)", runtime)).toBeGreaterThan(runtime);
    expect(dispatcher.indexOf("releaseClaimedCustomerTurnSafe", runtime)).toBe(-1);
  });
});
