import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("generation lock least privilege",()=>{
 it("reasserts read-only service-role access at the final database fence",()=>{
  expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");
  expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM PUBLIC,anon,authenticated");
  expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");
  expect(privileges).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE)\b/i);
 });
});
