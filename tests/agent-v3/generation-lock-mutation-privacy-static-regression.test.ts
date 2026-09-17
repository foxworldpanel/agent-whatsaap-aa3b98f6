import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock mutation SQL privacy",()=>{
 it("keeps refresh and release private to service role",()=>{
  expect(refresh).toContain("FROM PUBLIC,anon,authenticated");
  expect(refresh).toContain("TO service_role");
  expect(release).toContain("FROM PUBLIC,anon,authenticated");
  expect(release).toContain("TO service_role");
 });
});
