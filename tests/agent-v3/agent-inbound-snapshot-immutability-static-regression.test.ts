import {readFileSync} from "node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914370000_agent_inbound_snapshot_immutability.sql","utf8");
describe("Stage B semantic snapshot immutability",()=>{
 it("freezes routing and content identity while leaving ownership fields mutable",()=>{for(const field of ["message_id","conversation_id","workspace_id","send_target","input_text","input_kind","input_mime","deferred_funnel","created_at"])expect(sql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);expect(sql).not.toContain("NEW.status IS DISTINCT FROM OLD.status");expect(sql).not.toContain("NEW.claimed_by IS DISTINCT FROM OLD.claimed_by");});
 it("guards every Stage B update at the database boundary",()=>{expect(sql).toContain("BEFORE UPDATE ON public.agent_inbound_jobs");expect(sql).toContain("Agent inbound semantic snapshot is immutable");});
});
