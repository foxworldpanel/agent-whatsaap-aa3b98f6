import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition transaction fence",()=>{
 it("locks conversation before reading current lock",()=>{
  expect(acquire.indexOf("pg_advisory_xact_lock")).toBeLessThan(acquire.indexOf("SELECT holder,acquired_at"));
 });
});
