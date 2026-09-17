import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition fail closed for active owners",()=>{
 it("returns false instead of deleting when durable runtime exists",()=>{
  const secondOwners=acquire.indexOf("IF EXISTS (",acquire.indexOf("v_acquired_at>=p_stale_before"));
  const deletion=acquire.indexOf("DELETE FROM public.agent_generation_locks",secondOwners);
  expect(acquire.indexOf("RETURN false;",secondOwners)).toBeLessThan(deletion);
 });
});
