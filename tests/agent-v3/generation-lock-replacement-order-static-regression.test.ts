import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock replacement ordering",()=>{
 it("deletes exact stale owner before inserting successor",()=>{
  const deletion=acquire.lastIndexOf("DELETE FROM public.agent_generation_locks");
  const successor=acquire.lastIndexOf("INSERT INTO public.agent_generation_locks");
  expect(deletion).toBeGreaterThan(-1);
  expect(successor).toBeGreaterThan(deletion);
 });
});
