import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock blank-holder fail closed",()=>{
 it("rejects blank refresh and release ownership",()=>{
  for(const sql of [refresh,release]) expect(sql).toContain("IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false");
 });
});
