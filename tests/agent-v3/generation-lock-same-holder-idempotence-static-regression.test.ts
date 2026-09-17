import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock same-holder reacquisition",()=>{
 it("is idempotent for the exact current holder",()=>{expect(acquire).toContain("IF v_current_holder=p_holder THEN RETURN true");});
});
