import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const endpoint=readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");
const funnelRecovery=readFileSync("supabase/migrations/20260914453000_welcome_funnel_recovery_delete_capability.sql","utf8");
const genericRecovery=readFileSync("supabase/migrations/20260914450000_generation_lock_recovery_fairness_with_funnel.sql","utf8");
describe("Welcome Funnel recovery canonical ownership",()=>{
 it("generic recovery cannot delete ownership from a running Funnel",()=>{expect(genericRecovery).toContain("funnel.status='running'");expect(genericRecovery).toContain("NOT EXISTS");});
 it("Funnel recovery quarantines before exact stale-lock cleanup",()=>{const review=funnelRecovery.indexOf("UPDATE public.welcome_funnel_execution_state");const cleanup=funnelRecovery.indexOf("DELETE FROM public.agent_generation_locks");expect(review).toBeGreaterThan(-1);expect(cleanup).toBeGreaterThan(review);expect(funnelRecovery).toContain("g.holder=v_lock.holder");expect(funnelRecovery).toContain("g.acquired_at=v_lock.acquired_at");});
 it("endpoint supplies both canonical stale horizons",()=>{expect(endpoint).toContain("GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS");expect(endpoint).toContain("p_generation_lock_stale_before: generationLockStaleBefore");});
});
