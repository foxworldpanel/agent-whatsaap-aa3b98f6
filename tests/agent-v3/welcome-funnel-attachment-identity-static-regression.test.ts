import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const migration=readFileSync(
 "supabase/migrations/20260914420000_welcome_funnel_attachment_identity_guard.sql",
 "utf8",
);

describe("Welcome Funnel Customer Turn attachment identity",()=>{
 it("keeps exact Stage B message identity and the durable Funnel barrier in one trigger",()=>{
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
  expect(migration).toContain("v_message_id IS DISTINCT FROM NEW.message_id");
  expect(migration).toContain("status IN ('running','needs_review')");
  expect(migration).toContain("BEFORE INSERT ON public.agent_customer_turn_messages");
  expect(migration).toContain("EXECUTE FUNCTION public.guard_agent_customer_turn_member_pending_job()");
 });
});
