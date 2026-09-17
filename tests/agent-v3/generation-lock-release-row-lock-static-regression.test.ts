import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock release no successor deletion",()=>{
 it("reads current holder under row lock before exact delete",()=>{
  expect(release).toContain("FOR UPDATE");
  expect(release.indexOf("FOR UPDATE")).toBeLessThan(release.indexOf("DELETE FROM public.agent_generation_locks"));
 });
});
