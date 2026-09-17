import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock stale replacement exact row",()=>{
 it("deletes only the observed stale holder before replacement",()=>{
  expect(acquire).toContain("WHERE conversation_id=p_conversation_id AND holder=v_current_holder");
  expect(acquire).toContain("set_config('agent_v3.release_holder',v_current_holder,true)");
 });
});
