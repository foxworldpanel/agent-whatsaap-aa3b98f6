import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914404500_deferred_funnel_job_canonicalization.sql","utf8");
describe("deferred Funnel Stage B identity",()=>{it("canonicalizes from the persisted message instead of queued text",()=>{
 expect(sql).toContain("WHERE id=NEW.message_id");
 expect(sql).toContain("v_message.conversation_id IS DISTINCT FROM NEW.conversation_id");
 expect(sql).toContain("v_message.workspace_id IS DISTINCT FROM NEW.workspace_id");
 expect(sql).toContain("NEW.input_text:=coalesce(v_message.body,'')");
 expect(sql).toContain("NEW.deferred_funnel:=false");
 expect(sql).toContain("BEFORE INSERT ON public.agent_inbound_jobs");
});});
