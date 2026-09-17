import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914430000_welcome_funnel_start_exact_holder.sql", "utf8");
const runner = readFileSync("src/lib/welcome-funnel-runner.server.ts", "utf8");
const orchestrator = readFileSync("src/lib/welcome-funnel-orchestrator.server.ts", "utf8");

describe("Welcome Funnel exact-holder start and lease fence", () => {
  it("starts only under the caller's exact generation holder and canonical seed-31 fence", () => {
    expect(sql).toContain("hashtextextended(p_conversation_id::text, 31)");
    expect(sql).toContain("conversation_id = p_conversation_id AND holder = p_holder");
    expect(sql).toContain("exact generation lock ownership");
    expect(sql).toContain("TO service_role");
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
