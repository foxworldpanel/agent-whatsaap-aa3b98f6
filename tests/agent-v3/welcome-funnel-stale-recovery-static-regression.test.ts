import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914441500_welcome_funnel_stale_recovery_no_lock_steal.sql","utf8");
const endpoint=readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");
const lock=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("stale Welcome Funnel recovery",()=>{
 it("quarantines uncertain runtime without replay only after generation ownership is absent",()=>{expect(migration).toContain("status='needs_review'");expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");expect(migration).toContain("SELECT 1 FROM public.agent_generation_locks g");expect(migration).toContain("THEN CONTINUE");expect(migration).not.toContain("g.acquired_at>=p_generation_lock_stale_before");expect(migration).not.toContain("status='running' SET");});
 it("shares one 20-minute recovery schedule while lock removal remains the lock recovery path's responsibility",()=>{expect(lock).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");expect(endpoint).toContain("GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("recover_stale_welcome_funnel_executions");});
});
