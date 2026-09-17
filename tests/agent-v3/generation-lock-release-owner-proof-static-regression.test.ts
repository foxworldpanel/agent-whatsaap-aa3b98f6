import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock owner release capability exactness",()=>{
 it("sets capability only after current holder equality is proven",()=>{
  expect(release.indexOf("IF v_current_holder<>p_holder THEN RETURN true")).toBeLessThan(release.indexOf("set_config('agent_v3.release_holder',p_holder,true)"));
 });
});
