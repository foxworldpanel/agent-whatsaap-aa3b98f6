import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("generation lock least privilege",()=>{
 it("does not grant mutations back to service role",()=>{
  expect(privileges).not.toContain("GRANT INSERT");
  expect(privileges).not.toContain("GRANT UPDATE");
  expect(privileges).not.toContain("GRANT DELETE");
 });
});
