import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914534500_customer_turn_member_user_routing_fence.sql","utf8");
describe("Customer Turn member user routing fence",()=>{
 it("uses canonical seed-31 fence before authoritative Stage B row lock",()=>{const fence=sql.indexOf("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");const row=sql.indexOf("FROM public.agent_inbound_jobs j WHERE j.id=NEW.job_id FOR UPDATE",fence);expect(fence).toBeGreaterThan(-1);expect(row).toBeGreaterThan(fence);});
 it("requires exact unclaimed pending Stage B identity",()=>{expect(sql).toContain("v_message_id IS DISTINCT FROM NEW.message_id");expect(sql).toContain("v_status IS DISTINCT FROM 'pending' OR v_claimed_by IS NOT NULL");});
 it("resolves current user from exact durable conversation/workspace and rejects turn reassignment drift",()=>{expect(sql).toContain("c.id=v_conversation_id AND c.workspace_id=v_workspace_id");expect(sql).toContain("IF NOT FOUND OR v_user_id IS NULL");expect(sql).toContain("v_turn_workspace_id IS DISTINCT FROM v_workspace_id");expect(sql).toContain("v_turn_user_id IS DISTINCT FROM v_user_id");});
 it("extends Funnel attachment barrier to full routing identity and uncertain state",()=>{expect(sql).toContain("s.workspace_id IS DISTINCT FROM v_workspace_id");expect(sql).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(sql).toContain("s.status IN('running','needs_review')");});
});
