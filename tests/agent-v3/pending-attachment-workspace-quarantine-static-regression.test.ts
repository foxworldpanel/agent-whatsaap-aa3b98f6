import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914530000_pending_attachment_workspace_quarantine.sql","utf8");
const member=readFileSync("supabase/migrations/20260914534500_customer_turn_member_user_routing_fence.sql","utf8");
describe("pending attachment routing quarantine",()=>{
 it("serializes on canonical conversation fence and keeps final member trigger authoritative",()=>{expect(sql).toContain("hashtextextended(v_conversation.conversation_id::text,31)");expect(member).toContain("pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");});
 it("quarantines corrupt collecting turn instead of raising forever",()=>{expect(sql).toContain("v_turn_workspace IS DISTINCT FROM v_job.workspace_id");expect(sql).toContain("state='needs_review'");expect(sql).not.toContain("RAISE EXCEPTION 'Pending attachment Customer Turn workspace mismatch'");});
 it("quarantines already attached pending members but preserves unattached job for a clean turn",()=>{expect(sql).toContain("FROM public.agent_customer_turn_messages tm WHERE tm.turn_id=v_turn AND tm.job_id=j.id");expect(sql).toContain("IF v_turn IS NULL THEN INSERT INTO public.agent_customer_turns");expect(sql).toContain("VALUES(v_job.conversation_id,v_job.workspace_id)");});
 it("final member trigger refuses user/workspace drift and active or uncertain Funnel ownership",()=>{expect(member).toContain("v_turn_workspace_id IS DISTINCT FROM v_workspace_id");expect(member).toContain("v_turn_user_id IS DISTINCT FROM v_user_id");expect(member).toContain("s.workspace_id IS DISTINCT FROM v_workspace_id");expect(member).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(member).toContain("s.status IN('running','needs_review')");});
});
