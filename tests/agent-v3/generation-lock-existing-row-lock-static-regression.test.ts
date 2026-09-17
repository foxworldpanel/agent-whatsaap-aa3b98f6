import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition row serialization",()=>{
 it("row-locks an existing generation owner",()=>{expect(acquire).toContain("FOR UPDATE");});
});
