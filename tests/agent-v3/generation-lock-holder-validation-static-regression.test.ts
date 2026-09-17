import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock holder validation",()=>{
 it("rejects blank holder before mutation",()=>{expect(acquire).toContain("IF p_holder IS NULL OR btrim(p_holder)='' THEN RETURN false");});
});
