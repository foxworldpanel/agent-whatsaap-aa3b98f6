import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
const refresh=readFileSync("supabase/migrations/20260914474500_generation_lock_refresh_canonical_fence.sql","utf8");
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock canonical advisory namespace",()=>{
 it("uses seed 31 for all ordinary ownership mutations",()=>{
  for(const sql of [acquire,refresh,release]) expect(sql).toContain("hashtextextended(p_conversation_id::text,31)");
 });
});
