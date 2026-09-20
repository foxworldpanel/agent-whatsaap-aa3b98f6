import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const webhook=readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");
const shared=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
const gate=readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts","utf8");
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("webhook generation lock ownership",()=>{
 it("removes local five-minute DB lock split brain from webhook",()=>{expect(shared).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");expect(webhook).not.toContain("DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000");expect(webhook).not.toContain('.from("agent_generation_locks")');expect(webhook).not.toContain("acquireConversationDbLock");expect(webhook).not.toContain("releaseConversationDbLock");expect(gate).toContain("orchestrateWelcomeFunnel");});
 it("shared helper mutates generation ownership only through canonical RPCs",()=>{expect(shared).toContain('"acquire_agent_conversation_lock"');expect(shared).toContain('"refresh_agent_conversation_lock"');expect(shared).toContain('"release_agent_conversation_lock"');});
 it("service role cannot bypass canonical generation-lock mutations",()=>{expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");});
});
