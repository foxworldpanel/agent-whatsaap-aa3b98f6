import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
describe("Welcome Funnel durable progress",()=>{
 it("creates running state before any provider send",()=>{expect(source.indexOf("await startExecutionState")).toBeLessThan(source.indexOf("await uazapiSendText"));expect(source).toContain('.insert({funnel_id:params.funnelId');});
 it("requires a matched running row for durable mutations",()=>{expect(source).toContain('.eq("status","running").select("funnel_id").maybeSingle()');expect(source).toContain("running execution ownership was lost");});
 it("keeps CRM completion secondary to durable execution truth",()=>{expect(source.indexOf("await markExecutionCompleted")).toBeLessThan(source.indexOf('funnel_status:"completed"'));});
 it("unexpected failures attempt to quarantine only an existing running execution",()=>{expect(source).toContain("Falha ao persistir needs_review após erro inesperado");expect(source).toContain('.eq("contact_id",params.contactId).eq("status","running")');});
});
