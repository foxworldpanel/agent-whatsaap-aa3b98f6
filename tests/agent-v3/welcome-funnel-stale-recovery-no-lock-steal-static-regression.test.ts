import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const funnel=readFileSync("supabase/migrations/20260914444500_welcome_funnel_stale_recovery_owns_lock_cleanup.sql","utf8");
const generic=readFileSync("supabase/migrations/20260914443000_generation_lock_recovery_respects_welcome_funnel.sql","utf8");
describe("Welcome Funnel stale recovery lock ownership",()=>{
 it("uses the canonical nonblocking conversation fence",()=>{expect(funnel).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");});
 it("never quarantines while a fresh generation lease exists",()=>{expect(funnel).toContain("g.acquired_at>=p_generation_lock_stale_before");expect(funnel).toContain("THEN CONTINUE");});
 it("keeps generic stale-lock recovery away from running Funnel ownership",()=>{expect(generic).toContain("FROM public.welcome_funnel_execution_state funnel");expect(generic).toContain("funnel.status='running'");});
 it("quarantines before removing a stale Funnel lock",()=>{expect(funnel.indexOf("UPDATE public.welcome_funnel_execution_state")).toBeLessThan(funnel.indexOf("DELETE FROM public.agent_generation_locks"));});
});
