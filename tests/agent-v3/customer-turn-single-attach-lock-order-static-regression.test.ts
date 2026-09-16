import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20260914182500_customer_turn_lock_order.sql"),"utf8");
describe("single-job Customer Turn attachment lock order",()=>{
 it("discovers the immutable conversation before taking advisory seed 31",()=>{const fn=migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.attach_agent_inbound_job_to_customer_turn"),migration.indexOf("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job"));const discover=fn.indexOf("SELECT conversation_id INTO v_conversation_id");const advisory=fn.indexOf("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");const rowLock=fn.indexOf("FOR UPDATE");expect(discover).toBeGreaterThan(-1);expect(advisory).toBeGreaterThan(discover);expect(rowLock).toBeGreaterThan(advisory);});
 it("revalidates immutable conversation identity after the job row lock",()=>{expect(migration).toContain("IF v_job.conversation_id<>v_conversation_id THEN");});
});
