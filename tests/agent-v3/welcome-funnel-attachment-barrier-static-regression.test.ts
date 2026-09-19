import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const historical=readFileSync("supabase/migrations/20260914394500_welcome_funnel_attachment_barrier.sql","utf8");
const finalIdentity=readFileSync("supabase/migrations/20260914534500_customer_turn_member_user_routing_fence.sql","utf8");
describe("Welcome Funnel attachment barrier",()=>{
 it("historically keeps inbound pending while Funnel side effects are active or uncertain",()=>{expect(historical).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");expect(historical).toContain("s.status IN ('running','needs_review')");expect(historical).toContain("Customer Turn attachment blocked by Welcome Funnel execution barrier");});
 it("final attachment barrier also fences durable routing identity under seed 31",()=>{expect(finalIdentity).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");expect(finalIdentity).toContain("v_message_id IS DISTINCT FROM NEW.message_id");expect(finalIdentity).toContain("v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL");expect(finalIdentity).toContain("v_turn_workspace_id IS DISTINCT FROM v_workspace_id");expect(finalIdentity).toContain("v_turn_user_id IS DISTINCT FROM v_user_id");expect(finalIdentity).toContain("s.workspace_id IS DISTINCT FROM v_workspace_id");expect(finalIdentity).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(finalIdentity).toContain("s.status IN('running','needs_review')");});
});
