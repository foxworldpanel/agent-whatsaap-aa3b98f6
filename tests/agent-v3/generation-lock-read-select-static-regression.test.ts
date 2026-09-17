import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock read-only uncertainty path",()=>{
 it("retains SELECT needed for durable uncertainty resolution",()=>{
  expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");
  expect(source).toContain("readConversationLock");
 });
});
