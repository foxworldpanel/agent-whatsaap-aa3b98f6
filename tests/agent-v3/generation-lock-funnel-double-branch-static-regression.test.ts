import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition durable funnel barrier",()=>{
 it("treats running funnel as ownership in both acquisition branches",()=>{
  expect((acquire.match(/welcome_funnel_execution_state/g)||[]).length).toBe(2);
  expect((acquire.match(/f\.status='running'/g)||[]).length).toBe(2);
 });
});
