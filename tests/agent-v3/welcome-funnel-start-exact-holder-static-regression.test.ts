import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914495000_welcome_funnel_start_idempotent_exact_identity.sql", "utf8");
const runner = readFileSync("src/lib/welcome-funnel-runner.server.ts", "utf8");
const orchestrator = readFileSync("src/lib/welcome-funnel-orchestrator.server.ts", "utf8");

describe("Welcome Funnel exact-holder start and lease fence", () => {
  it("starts only under the caller's exact generation holder and canonical seed-31 fence", () => {
    expect(sql).toContain("hashtextextended(p_conversation_id::text,31)");
    expect(sql).toContain("conversation_id=p_conversation_id AND holder=p_holder");
    expect(sql).toContain("exact generation lock ownership");
    expect(sql).toContain("TO service_role");
  });
  it("refuses a different active Funnel while allowing exact durable start retry", () => {
    expect(sql).toContain("funnel_id=p_funnel_id AND contact_id=p_contact_id");
    expect(sql).toContain("THEN RETURN true");
    expect(sql).toContain("Welcome Funnel start blocked by active Funnel execution");
  });
  it("routes durable start through the exact-holder RPC instead of a direct insert", () => {
    expect(runner).toContain('rpc("start_welcome_funnel_execution"');
    expect(runner).toContain("p_holder:params.holder");
    expect(runner).not.toContain('from("welcome_funnel_execution_state").insert');
  });
  it("revalidates lease ownership around external Funnel effects", () => {
    expect(runner).toContain("assertExecutionOwnership:()=>Promise<void>");
    expect(runner).toContain("await params.assertExecutionOwnership();");
    expect(orchestrator).toContain("holder, assertExecutionOwnership");
  });
});
