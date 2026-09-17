import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const source=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
const migration=readFileSync("supabase/migrations/20260914433000_welcome_funnel_exact_holder_transitions.sql","utf8");
describe("Welcome Funnel durable progress",()=>{
 it("creates running state through the exact-holder RPC before any provider send",()=>{expect(source.indexOf("await startExecutionState")).toBeLessThan(source.indexOf("await uazapiSendText"));expect(source).toContain('rpc("start_welcome_funnel_execution"');expect(source).toContain("p_holder:params.holder");expect(source).not.toContain('.from("welcome_funnel_execution_state").insert(');});
 it("routes checkpoints and terminal mutations through an exact-holder RPC",()=>{expect(source).toContain('rpc("mutate_welcome_funnel_execution"');expect(source).toContain("p_holder:params.holder");expect(source).not.toContain('.from("welcome_funnel_execution_state").update(');expect(migration).toContain("hashtextextended(p_conversation_id::text, 31)");expect(migration).toContain("g.holder = p_holder");expect(migration).toContain("exact holder ownership was lost");});
 it("keeps CRM completion secondary to durable execution truth",()=>{expect(source.indexOf("await markExecutionCompleted")).toBeLessThan(source.indexOf('funnel_status:"completed"'));});
 it("does not let the ownerless compatibility failure logger mutate durable execution state",()=>{const marker=source.indexOf("export async function markFunnelRunFailed");expect(marker).toBeGreaterThan(-1);expect(source.slice(marker)).not.toContain('welcome_funnel_execution_state").update');expect(source.slice(marker)).toContain("não altera estado durável sem exact-holder");});
});
