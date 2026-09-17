import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914454500_generation_lock_insert_welcome_funnel_fence.sql","utf8");
describe("generation lock insert Welcome Funnel fence",()=>{
 it("serializes inserts in the canonical conversation namespace",()=>{expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31))");});
 it("rejects a new generation owner while a durable Funnel is running",()=>{expect(migration).toContain("FROM public.welcome_funnel_execution_state f");expect(migration).toContain("f.status='running'");expect(migration).toContain("cannot acquire generation lock while Welcome Funnel owns conversation");});
 it("retains the Customer Turn ownership fence",()=>{expect(migration).toContain("t.state IN ('processing_safe','processing')");});
});
