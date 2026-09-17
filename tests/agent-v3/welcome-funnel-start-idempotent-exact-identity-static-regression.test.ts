import {readFileSync} from "node:fs";import{describe,expect,it}from"vitest";
const sql=readFileSync("supabase/migrations/20260914495000_welcome_funnel_start_idempotent_exact_identity.sql","utf8");
describe("Welcome Funnel exact start idempotency",()=>{
 it("returns true only for the same complete running execution identity",()=>{expect(sql).toContain("funnel_id=p_funnel_id AND contact_id=p_contact_id");expect(sql).toContain("conversation_id=p_conversation_id AND user_id=p_user_id AND workspace_id=p_workspace_id");expect(sql).toContain("AND status='running'");expect(sql).toContain("THEN RETURN true");});
 it("still blocks a different running Funnel in the conversation",()=>{expect(sql).toContain("WHERE conversation_id=p_conversation_id AND status='running'");expect(sql).toContain("Welcome Funnel start blocked by active Funnel execution");});
 it("does not reset the durable row on exact retry",()=>{expect(sql.indexOf("THEN RETURN true")).toBeLessThan(sql.indexOf("INSERT INTO public.welcome_funnel_execution_state"));});
});
