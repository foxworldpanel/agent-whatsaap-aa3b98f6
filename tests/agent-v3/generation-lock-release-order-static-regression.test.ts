import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock release transaction ordering",()=>{
 it("serializes before reading/deleting owner",()=>{expect(release.indexOf("pg_advisory_xact_lock")).toBeLessThan(release.indexOf("SELECT holder INTO v_current_holder"));});
});
