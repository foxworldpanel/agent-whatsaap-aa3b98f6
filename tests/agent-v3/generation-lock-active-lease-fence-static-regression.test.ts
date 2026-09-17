import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock active lease fence",()=>{
 it("never replaces a non-stale different holder",()=>{expect(acquire).toContain("IF v_acquired_at>=p_stale_before THEN RETURN false");});
});
