import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
const privileges=readFileSync("supabase/migrations/20260914481500_generation_lock_final_privilege_fence.sql","utf8");
const start=readFileSync("supabase/migrations/20260914521500_welcome_funnel_start_primary_identity_fence.sql","utf8");

describe("canonical generation lock acquisition Welcome Funnel fence",()=>{
 it("refuses both missing-lock insertion and stale replacement while Funnel owns conversation",()=>{
  expect(acquire).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect((acquire.match(/f\.status='running'/g)||[]).length).toBeGreaterThanOrEqual(2);
  expect(acquire).toContain("v_acquired_at>=p_stale_before");
  expect(acquire).toContain("set_config('agent_v3.release_holder',v_current_holder,true)");
 });
 it("keeps direct lock-table mutation unavailable after canonical RPC definitions",()=>{
  expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM service_role");
  expect(privileges).toContain("REVOKE INSERT,UPDATE,DELETE ON public.agent_generation_locks FROM PUBLIC,anon,authenticated");
  expect(privileges).toContain("GRANT SELECT ON public.agent_generation_locks TO service_role");
 });
 it("requires the Funnel starter to prove exact canonical lock ownership",()=>{
  expect(start).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect(start).toContain("conversation_id=p_conversation_id AND holder=p_holder");
  expect(start).toContain("Welcome Funnel start requires exact generation lock ownership");
 });
});
