import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914410000_welcome_funnel_start_runtime_fence.sql","utf8");
describe("Welcome Funnel symmetric runtime fence",()=>{it("serializes start and rejects active Agent V3 owners",()=>{
 expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31))");
 expect(sql).toContain("agent_customer_turns");
 expect(sql).toContain("t.state IN ('processing_safe','processing')");
 expect(sql).toContain("agent_inbound_jobs");
 expect(sql).toContain("j.status IN ('processing_safe','processing')");
 expect(sql).toContain("BEFORE INSERT ON public.welcome_funnel_execution_state");
});});
