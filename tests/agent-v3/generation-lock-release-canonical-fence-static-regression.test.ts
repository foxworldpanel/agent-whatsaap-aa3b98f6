import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock release canonical fence",()=>{
 it("requires exact holder under seed 31",()=>{
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect(migration).toContain("IF v_current_holder<>p_holder THEN RETURN true");
  expect(migration).toContain("AND holder=p_holder");
 });
});
