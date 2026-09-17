import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914500000_welcome_funnel_terminal_start_fence.sql","utf8");
describe("Welcome Funnel terminal start fence",()=>{
 it("returns idempotently only for the exact running durable execution",()=>{expect(sql).toContain("IF v_status='running' THEN RETURN true");});
 it("refuses silent restart of completed or needs_review durable evidence",()=>{expect(sql).toContain("Welcome Funnel start blocked by terminal durable execution state");expect(sql).toContain("RAISE EXCEPTION");});
 it("keeps exact holder and seed 31",()=>{expect(sql).toContain("hashtextextended(p_conversation_id::text,31)");expect(sql).toContain("holder=p_holder");});
});
