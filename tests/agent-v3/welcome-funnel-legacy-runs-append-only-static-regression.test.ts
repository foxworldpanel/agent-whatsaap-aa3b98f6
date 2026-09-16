import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914381500_welcome_funnel_legacy_runs_append_only.sql"),"utf8");
describe("legacy Welcome Funnel run ledger",()=>{it("allows service_role to append/read but not rewrite/delete history",()=>{expect(migration).toContain("REVOKE UPDATE,DELETE ON TABLE public.welcome_funnel_runs FROM service_role");expect(migration).toContain("GRANT SELECT,INSERT ON TABLE public.welcome_funnel_runs TO service_role");});});
