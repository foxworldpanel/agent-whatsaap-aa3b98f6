import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock release idempotence",()=>{
 it("does not delete a successor holder",()=>{
  expect(release).toContain("IF NOT FOUND THEN RETURN true");
  expect(release).toContain("IF v_current_holder<>p_holder THEN RETURN true");
  expect(release).toContain("WHERE conversation_id=p_conversation_id AND holder=p_holder");
 });
});
