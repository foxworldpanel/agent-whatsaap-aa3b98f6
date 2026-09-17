import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const baseline=readFileSync("supabase/migrations/20260914353000_welcome_funnel_execution_state.sql","utf8");
const deleteGuard=readFileSync("supabase/migrations/20260914384500_welcome_funnel_execution_delete_guard.sql","utf8");
const insertOnly=readFileSync("supabase/migrations/20260914431500_welcome_funnel_execution_insert_rpc_only.sql","utf8");
const updateOnly=readFileSync("supabase/migrations/20260914440000_welcome_funnel_execution_update_rpc_only.sql","utf8");
describe("Welcome Funnel execution privilege migration chain",()=>{
 it("starts broad only in the table creation migration",()=>{expect(baseline).toContain("GRANT SELECT,INSERT,UPDATE,DELETE ON public.welcome_funnel_execution_state TO service_role");});
 it("revokes DELETE and never re-grants it later",()=>{expect(deleteGuard).toContain("REVOKE DELETE ON TABLE public.welcome_funnel_execution_state FROM service_role");expect(insertOnly).not.toContain("GRANT DELETE");expect(insertOnly).not.toContain("UPDATE, DELETE");expect(updateOnly).not.toContain("GRANT DELETE");});
 it("ends with service-role table access read-only",()=>{expect(insertOnly).toContain("REVOKE INSERT");expect(updateOnly).toContain("REVOKE UPDATE");expect(updateOnly).toContain("GRANT SELECT ON public.welcome_funnel_execution_state TO service_role");});
});
