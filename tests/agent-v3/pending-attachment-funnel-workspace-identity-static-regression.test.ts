import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const historical=readFileSync("supabase/migrations/20260914513000_pending_attachment_funnel_workspace_identity.sql","utf8");
const finalDrain=readFileSync("supabase/migrations/20260914530000_pending_attachment_workspace_quarantine.sql","utf8");
const finalBarrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
describe("pending attachment Funnel routing identity",()=>{
 it("historically filters discovery and rechecks through the shared workspace barrier",()=>{expect(historical).toContain("NOT public.has_welcome_funnel_agent_barrier(j.conversation_id,j.workspace_id)");expect(historical).toContain("pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31))");expect(historical).toContain("has_welcome_funnel_agent_barrier(v_job.conversation_id,v_job.workspace_id)");});
 it("final drain quarantines cross-workspace collecting turns instead of failing forever",()=>{expect(finalDrain).toContain("v_turn_workspace IS DISTINCT FROM v_job.workspace_id");expect(finalDrain).toContain("state='needs_review'");expect(finalDrain).toContain("collecting Customer Turn workspace mismatch during pending attachment");expect(finalDrain).not.toContain("RAISE EXCEPTION 'Pending attachment Customer Turn workspace mismatch'");});
 it("shared final barrier resolves and fences current user identity as well as workspace",()=>{expect(finalBarrier).toContain("SELECT c.user_id INTO v_user_id");expect(finalBarrier).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");expect(finalBarrier).toContain("s.user_id IS DISTINCT FROM v_user_id");expect(finalBarrier).toContain("s.status IN('running','needs_review')");});
});
