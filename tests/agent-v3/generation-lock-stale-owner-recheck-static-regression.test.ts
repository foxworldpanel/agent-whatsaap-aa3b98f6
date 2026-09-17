import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock stale replacement durable owner recheck",()=>{
 it("rechecks Funnel ownership after stale detection and before delete",()=>{
  const stale=acquire.indexOf("v_acquired_at>=p_stale_before");
  const funnel=acquire.indexOf("welcome_funnel_execution_state",stale);
  const deletion=acquire.indexOf("DELETE FROM public.agent_generation_locks",stale);
  expect(funnel).toBeGreaterThan(stale);
  expect(funnel).toBeLessThan(deletion);
 });
});
