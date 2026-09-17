import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
describe("generation lock acquisition SQL privacy",()=>{
 it("keeps canonical acquire private to service role",()=>{
  expect(acquire).toContain("REVOKE ALL ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated");
  expect(acquire).toContain("GRANT EXECUTE ON FUNCTION public.acquire_agent_conversation_lock(uuid,text,timestamptz) TO service_role");
 });
});
