import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
describe("generation lock refresh canonical fence",()=>{
 it("serializes exact-holder lease refresh with seed 31",()=>{
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect(migration).toContain("AND holder=p_holder");
  expect(migration).toContain("SET acquired_at=now()");
 });
});
