import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privilege=readFileSync("supabase/migrations/20260914440000_welcome_funnel_execution_update_rpc_only.sql","utf8");
const runner=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
const recovery=readFileSync("supabase/migrations/20260914434500_welcome_funnel_stale_recovery_canonical_lease.sql","utf8");
describe("Welcome Funnel durable UPDATE authority",()=>{
 it("removes direct service-role update authority",()=>{expect(privilege).toContain("REVOKE UPDATE ON public.welcome_funnel_execution_state FROM service_role");expect(privilege).toContain("GRANT SELECT ON public.welcome_funnel_execution_state TO service_role");expect(privilege).not.toContain("GRANT UPDATE");});
 it("keeps normal runtime mutations behind the exact-holder RPC",()=>{expect(runner).toContain('rpc("mutate_welcome_funnel_execution"');expect(runner).not.toContain('.from("welcome_funnel_execution_state").update(');});
 it("keeps crash recovery as a SECURITY DEFINER fenced database transition",()=>{expect(recovery).toContain("SECURITY DEFINER");expect(recovery).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");expect(recovery).toContain("UPDATE public.welcome_funnel_execution_state");});
});
