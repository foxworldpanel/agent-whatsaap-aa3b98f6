import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock missing-row owner fence",()=>{
 it("checks every durable owner before first insertion",()=>{
  const missing=acquire.indexOf("IF NOT FOUND THEN");const insert=acquire.indexOf("INSERT INTO public.agent_generation_locks",missing);
  expect(missing).toBeGreaterThan(-1);expect(insert).toBeGreaterThan(missing);
  for(const needle of ["agent_inbound_jobs","j.status IN ('processing_safe','processing')","agent_customer_turns","t.state IN ('processing_safe','processing')","welcome_funnel_execution_state","f.status='running'"]){const pos=acquire.indexOf(needle,missing);expect(pos).toBeGreaterThan(missing);expect(pos).toBeLessThan(insert);}
 });
 it("does not bypass the owner fence for a stale existing row",()=>{const stale=acquire.indexOf("IF v_acquired_at>=p_stale_before");const remove=acquire.indexOf("DELETE FROM public.agent_generation_locks",stale);expect(acquire.indexOf("j.status IN ('processing_safe','processing')",stale)).toBeLessThan(remove);expect(acquire.indexOf("t.state IN ('processing_safe','processing')",stale)).toBeLessThan(remove);expect(acquire.indexOf("f.status='running'",stale)).toBeLessThan(remove);});
});
