import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition insert ordering",()=>{
 it("serializes before first possible insert",()=>{
  expect(acquire.indexOf("pg_advisory_xact_lock")).toBeLessThan(acquire.indexOf("INSERT INTO public.agent_generation_locks"));
 });
});
