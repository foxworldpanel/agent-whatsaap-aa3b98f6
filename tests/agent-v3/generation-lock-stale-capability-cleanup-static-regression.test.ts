import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock stale replacement capability cleanup",()=>{
 it("clears transaction-local release capability after exact stale delete",()=>{
  expect(acquire).toContain("set_config('agent_v3.release_conversation_id','',true)");
  expect(acquire).toContain("set_config('agent_v3.release_holder','',true)");
 });
});
