import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const funnel=readFileSync("supabase/migrations/20260914453000_welcome_funnel_recovery_delete_capability.sql","utf8");
const generic=readFileSync("supabase/migrations/20260914450000_generation_lock_recovery_fairness_with_funnel.sql","utf8");
describe("Welcome Funnel stale recovery lock ownership",()=>{
 it("uses the canonical nonblocking conversation fence",()=>{expect(funnel).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");});
 it("never quarantines while a fresh generation lease exists",()=>{expect(funnel).toContain("g.acquired_at>=p_generation_lock_stale_before");expect(funnel).toContain("THEN CONTINUE");});
 it("keeps final generic stale-lock recovery away from running Funnel ownership",()=>{expect(generic).toContain("FROM public.welcome_funnel_execution_state funnel");expect(generic).toContain("funnel.status='running'");});
 it("quarantines before removing the exact stale Funnel lock",()=>{expect(funnel.indexOf("UPDATE public.welcome_funnel_execution_state")).toBeLessThan(funnel.indexOf("DELETE FROM public.agent_generation_locks"));expect(funnel).toContain("g.holder=v_lock.holder");expect(funnel).toContain("g.acquired_at=v_lock.acquired_at");});
});
