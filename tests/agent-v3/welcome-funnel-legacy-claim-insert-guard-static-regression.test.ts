import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914413000_welcome_funnel_legacy_claim_insert_guard.sql","utf8");
describe("legacy Welcome Funnel claims",()=>{it("requires matching durable running state",()=>{
 expect(sql).toContain("BEFORE INSERT ON public.welcome_funnel_runs");
 expect(sql).toContain("s.funnel_id=NEW.funnel_id");
 expect(sql).toContain("s.contact_id=NEW.contact_id");
 expect(sql).toContain("s.workspace_id=NEW.workspace_id");
 expect(sql).toContain("s.status='running'");
});});
