import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
describe("generation lock refresh no owner creation",()=>{
 it("updates only an existing exact holder and returns FOUND",()=>{
  expect(refresh).toContain("UPDATE public.agent_generation_locks");
  expect(refresh).toContain("AND holder=p_holder");
  expect(refresh).toContain("RETURN FOUND");
  expect(refresh).not.toContain("INSERT INTO public.agent_generation_locks");
 });
});
