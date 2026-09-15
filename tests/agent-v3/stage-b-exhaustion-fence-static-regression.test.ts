import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914361500_stage_b_exhaustion_conversation_fence.sql","utf8");
const source=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("Stage B exhausted pending quarantine",()=>{
 it("quarantines exhausted jobs only after winning the nonblocking conversation fence",()=>{const fence=migration.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");const update=migration.indexOf("UPDATE public.agent_inbound_jobs j",fence);expect(fence).toBeGreaterThan(0);expect(update).toBeGreaterThan(fence);});
 it("revalidates that exhausted work is still unattached",()=>{expect(migration).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)");});
 it("routes background claims through the fenced wrapper",()=>{expect(source).toContain('s.rpc("claim_next_agent_inbound_job_fenced"');});
});
