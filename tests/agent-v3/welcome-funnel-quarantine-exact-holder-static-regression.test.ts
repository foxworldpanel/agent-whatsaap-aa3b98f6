import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914424500_welcome_funnel_quarantine_exact_holder.sql", "utf8");
const orchestrator = readFileSync("src/lib/welcome-funnel-orchestrator.server.ts", "utf8");

describe("Welcome Funnel ambiguous quarantine exact-holder ownership", () => {
  it("requires the caller's exact generation lock holder under the canonical seed-31 fence", () => {
    expect(sql).toContain("hashtextextended(p_conversation_id::text, 31)");
    expect(sql).toContain("AND holder = p_holder");
    expect(sql).toContain("exact generation lock ownership");
  });

  it("passes the same holder acquired by the orchestrator into quarantine", () => {
    expect(orchestrator).toContain("const holder=`welcome-funnel:${p.funnel.id}:${randomUUID()}`");
    expect(orchestrator).toContain("p_holder:p.holder");
    expect(orchestrator).toContain("workspaceId:p.workspaceId,holder");
  });

  it("removes the old five-argument RPC surface", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.quarantine_ambiguous_welcome_funnel_claim(uuid,uuid,uuid,uuid,uuid)");
    expect(sql).toContain("uuid,uuid,uuid,uuid,uuid,text");
  });
});
