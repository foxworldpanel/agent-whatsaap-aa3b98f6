import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const insertFence = readFileSync("supabase/migrations/20260914431500_welcome_funnel_execution_insert_rpc_only.sql", "utf8");
const finalFence = readFileSync("supabase/migrations/20260914490000_welcome_funnel_execution_final_privilege_fence.sql", "utf8");
const runner = readFileSync("src/lib/welcome-funnel-runner.server.ts", "utf8");
const startRpc = readFileSync("supabase/migrations/20260914430000_welcome_funnel_start_exact_holder.sql", "utf8");
const quarantineRpc = readFileSync("supabase/migrations/20260914424500_welcome_funnel_quarantine_exact_holder.sql", "utf8");

describe("Welcome Funnel durable execution insert authority", () => {
  it("removes direct service-role INSERT authority and ends the migration chain read-only", () => {
    expect(insertFence).toContain("REVOKE INSERT ON public.welcome_funnel_execution_state FROM service_role");
    expect(finalFence).toContain("REVOKE INSERT, UPDATE, DELETE ON public.welcome_funnel_execution_state FROM service_role");
    expect(finalFence).toContain("GRANT SELECT ON public.welcome_funnel_execution_state TO service_role");
    expect(finalFence).not.toContain("GRANT INSERT");
    expect(finalFence).not.toContain("GRANT UPDATE");
    expect(finalFence).not.toContain("GRANT DELETE");
  });

  it("starts normal execution only through the exact-holder RPC", () => {
    expect(runner).toContain('rpc("start_welcome_funnel_execution"');
    expect(runner).not.toContain('.from("welcome_funnel_execution_state").insert');
    expect(startRpc).toContain("AND holder = p_holder");
    expect(startRpc).toContain("SECURITY DEFINER");
  });

  it("keeps ambiguous quarantine insertion behind its exact-holder definer RPC", () => {
    expect(quarantineRpc).toContain("AND holder = p_holder");
    expect(quarantineRpc).toContain("SECURITY DEFINER");
  });
});
