import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const insertGuard=readFileSync("supabase/migrations/20260914454500_generation_lock_insert_welcome_funnel_fence.sql","utf8");
const identityGuard=readFileSync("supabase/migrations/20260914473000_generation_lock_identity_immutability.sql","utf8");
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
describe("generation lock insert Welcome Funnel fence",()=>{
 it("serializes guarded inserts in the canonical conversation namespace",()=>{expect(insertGuard).toContain("pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31))");});
 it("rejects a new generation owner while a durable Funnel is running",()=>{expect(insertGuard).toContain("FROM public.welcome_funnel_execution_state f");expect(insertGuard).toContain("f.status='running'");expect(insertGuard).toContain("cannot acquire generation lock while Welcome Funnel owns conversation");});
 it("retains the Customer Turn ownership fence",()=>{expect(insertGuard).toContain("t.state IN ('processing_safe','processing')");});
 it("makes holder replacement immutable through UPDATE",()=>{expect(identityGuard).toContain("NEW.conversation_id IS DISTINCT FROM OLD.conversation_id");expect(identityGuard).toContain("NEW.holder IS DISTINCT FROM OLD.holder");expect(identityGuard).toContain("generation lock identity is immutable");});
 it("closes direct insert/update/delete to service role after canonical RPCs exist",()=>{expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM PUBLIC,anon,authenticated");expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");});
});
