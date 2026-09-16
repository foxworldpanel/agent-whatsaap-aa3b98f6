import {readFileSync} from "node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914374500_welcome_funnel_execution_transition_guard.sql","utf8");
describe("Welcome Funnel durable execution transition guard",()=>{
 it("freezes execution identity",()=>{for(const field of ["funnel_id","contact_id","conversation_id","user_id","workspace_id","started_at"])expect(sql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);});
 it("makes completed and review outcomes immutable",()=>{expect(sql).toContain("OLD.status IN ('completed','needs_review')");expect(sql).toContain("welcome funnel terminal execution state is immutable");});
 it("never lets a checkpoint move backwards or disappear",()=>{expect(sql).toContain("NEW.last_completed_step IS NULL");expect(sql).toContain("array_position(ARRAY['welcome_text','audio','panel_text','video','services_text']");expect(sql).toContain("welcome funnel checkpoint cannot move backwards");});
 it("installs the guard before every execution-state update",()=>{expect(sql).toContain("BEFORE UPDATE ON public.welcome_funnel_execution_state");expect(sql).toContain("guard_welcome_funnel_execution_state_transition()");});
});
