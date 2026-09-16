import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914414500_recover_stale_welcome_funnel_running.sql","utf8");
const endpoint=readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");
describe("stale Welcome Funnel recovery",()=>{it("quarantines uncertain runtime without replay and skips fresh leases",()=>{expect(migration).toContain("status='needs_review'");expect(migration).toContain("pg_try_advisory_xact_lock");expect(migration).toContain("g.acquired_at>=p_generation_lock_stale_before");expect(migration).not.toContain("status='running' SET");expect(endpoint).toContain("recover_stale_welcome_funnel_executions");expect(endpoint).toContain("WELCOME_FUNNEL_STALE_MS = 20 * 60 * 1000");});});
