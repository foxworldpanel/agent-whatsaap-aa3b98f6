import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const release=readFileSync("supabase/migrations/20260914480000_generation_lock_release_canonical_fence.sql","utf8");
describe("generation lock release capability cleanup",()=>{
 it("clears transaction-local exact-owner capability",()=>{
  expect(release).toContain("set_config('agent_v3.release_conversation_id','',true)");
  expect(release).toContain("set_config('agent_v3.release_holder','',true)");
 });
});
