import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("generation lock table mutation closure",()=>{
 it("revokes all three mutation verbs together",()=>{expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");});
});
