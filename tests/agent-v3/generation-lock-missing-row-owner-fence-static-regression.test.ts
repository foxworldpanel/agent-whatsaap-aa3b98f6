import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock missing-row owner fence",()=>{
 it("checks durable owners before first insertion",()=>{
  const missing=acquire.indexOf("IF NOT FOUND THEN");
  const insert=acquire.indexOf("INSERT INTO public.agent_generation_locks",missing);
  const funnel=acquire.indexOf("welcome_funnel_execution_state",missing);
  expect(funnel).toBeGreaterThan(missing);
  expect(funnel).toBeLessThan(insert);
 });
});
