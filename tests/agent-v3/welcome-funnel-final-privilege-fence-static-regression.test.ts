import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privilege=readFileSync("supabase/migrations/20260914490000_welcome_funnel_execution_final_privilege_fence.sql","utf8");
const runner=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
describe("Welcome Funnel final durable-state privilege boundary",()=>{
 it("leaves service-role table access read-only",()=>{expect(privilege).toContain("REVOKE INSERT, UPDATE, DELETE ON public.welcome_funnel_execution_state FROM service_role");expect(privilege).toContain("GRANT SELECT ON public.welcome_funnel_execution_state TO service_role");});
 it("keeps runtime writes on guarded RPCs",()=>{expect(runner).toContain('rpc("start_welcome_funnel_execution"');expect(runner).toContain('rpc("mutate_welcome_funnel_execution"');expect(runner).not.toContain('.from("welcome_funnel_execution_state").insert');expect(runner).not.toContain('.from("welcome_funnel_execution_state").update');expect(runner).not.toContain('.from("welcome_funnel_execution_state").delete');});
});
