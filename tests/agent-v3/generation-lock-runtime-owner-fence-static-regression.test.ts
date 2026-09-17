import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition no concurrent turn overlap",()=>{
 it("checks both Stage B and Customer Turn active states",()=>{
  expect(acquire).toContain("j.status IN ('processing_safe','processing')");
  expect(acquire).toContain("t.state IN ('processing_safe','processing')");
 });
});
