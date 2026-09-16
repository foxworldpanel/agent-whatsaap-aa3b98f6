import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914411500_customer_turn_ready_probe_welcome_funnel.sql","utf8");
describe("Customer Turn readiness matches Funnel fences",()=>{it("does not report running/review Funnel conversations as ready",()=>{
 expect(sql).toContain("welcome_funnel_execution_state");
 expect(sql).toContain("s.status IN ('running','needs_review')");
 expect(sql).toContain("agent_generation_locks");
 expect(sql).toContain("t.state='retry_safe'");
 expect(sql).toContain("t.state='collecting'");
});});
