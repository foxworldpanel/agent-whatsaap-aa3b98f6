import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const migration=readFileSync(
 "supabase/migrations/20260914420000_welcome_funnel_attachment_identity_guard.sql",
 "utf8",
);
const finalIdentity=readFileSync(
 "supabase/migrations/20260914534500_customer_turn_member_user_routing_fence.sql",
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
 it("extends the final attachment trigger to full workspace and user routing identity",()=>{
  expect(finalIdentity).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
  expect(finalIdentity).toContain("v_message_id IS DISTINCT FROM NEW.message_id");
  expect(finalIdentity).toContain("v_status IS DISTINCT FROM 'pending'");
  expect(finalIdentity).toContain("v_turn_workspace_id IS DISTINCT FROM v_workspace_id");
  expect(finalIdentity).toContain("v_turn_user_id IS DISTINCT FROM v_user_id");
  expect(finalIdentity).toContain("s.workspace_id IS DISTINCT FROM v_workspace_id");
  expect(finalIdentity).toContain("s.user_id IS DISTINCT FROM v_user_id");
  expect(finalIdentity).toContain("s.status IN('running','needs_review')");
 });
});
