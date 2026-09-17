import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914453000_welcome_funnel_recovery_delete_capability.sql","utf8");
const endpoint=readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");
const lock=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("stale Welcome Funnel recovery",()=>{
 it("quarantines uncertainty under the canonical fence and never steals a fresh lease",()=>{expect(migration).toContain("status='needs_review'");expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");expect(migration).toContain("g.acquired_at>=p_generation_lock_stale_before");expect(migration).toContain("THEN CONTINUE");});
 it("persists review before deleting only the exact stale Funnel generation lock",()=>{const review=migration.indexOf("UPDATE public.welcome_funnel_execution_state");const deletion=migration.indexOf("DELETE FROM public.agent_generation_locks");expect(review).toBeGreaterThan(-1);expect(deletion).toBeGreaterThan(review);expect(migration).toContain("g.holder=v_lock.holder");expect(migration).toContain("g.acquired_at=v_lock.acquired_at");});
 it("uses a transaction-local exact-holder delete capability and clears it immediately",()=>{expect(migration).toContain("set_config('agent_v3.release_conversation_id',v.conversation_id::text,true)");expect(migration).toContain("set_config('agent_v3.release_holder',v_lock.holder,true)");expect(migration).toContain("set_config('agent_v3.release_conversation_id','',true)");expect(migration).toContain("set_config('agent_v3.release_holder','',true)");});
 it("shares one 20-minute generation lease horizon with normal lock ownership",()=>{expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");expect(endpoint).toContain("GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("recover_stale_welcome_funnel_executions");});
});
