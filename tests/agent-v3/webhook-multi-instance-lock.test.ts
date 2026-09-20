import { describe,expect,it } from "vitest";import fs from "node:fs";
const lock=fs.readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
const dispatch=fs.readFileSync("src/lib/agent-v3/customer-turn-dispatch.server.ts","utf8");
const privileges=fs.readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("Agent V3 persistent conversation lock",()=>{
 it("keeps persistent lock reads encapsulated and dispatcher free of direct table ownership",()=>{expect(lock).toContain('.from("agent_generation_locks")');expect(lock).toContain("acquireAgentConversationLock");expect(lock).toContain("releaseAgentConversationLock");expect(dispatch).not.toContain('.from("agent_generation_locks")');});
 it("uses canonical 20 minute owner horizon",()=>{expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");expect(lock).not.toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 1000");});
 it("mutations are RPC-only while service role retains readback for uncertainty verification",()=>{expect(lock).toContain('"acquire_agent_conversation_lock"');expect(lock).toContain('"refresh_agent_conversation_lock"');expect(lock).toContain('"release_agent_conversation_lock"');expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");});
});
