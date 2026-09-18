import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914500000_welcome_funnel_terminal_start_fence.sql","utf8");
const runner=readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
const orchestrator=readFileSync("src/lib/welcome-funnel-orchestrator.server.ts","utf8");
describe("Welcome Funnel exact-holder start and lease fence",()=>{
 it("starts only under exact holder and canonical seed 31",()=>{expect(sql).toContain("hashtextextended(p_conversation_id::text,31)");expect(sql).toContain("conversation_id=p_conversation_id AND holder=p_holder");expect(sql).toContain("exact generation lock ownership");expect(sql).toContain("TO service_role");});
 it("is idempotent only for exact running state and refuses terminal restart",()=>{expect(sql).toContain("IF v_status='running' THEN RETURN true");expect(sql).toContain("Welcome Funnel start blocked by terminal durable execution state");expect(sql).toContain("Welcome Funnel start blocked by active Funnel execution");});
 it("routes durable start through RPC",()=>{expect(runner).toContain('rpc("start_welcome_funnel_execution"');expect(runner).toContain("p_holder:params.holder");expect(runner).not.toContain('from("welcome_funnel_execution_state").insert');});
 it("revalidates lease around effects",()=>{expect(runner).toContain("assertExecutionOwnership:()=>Promise<void>");expect(orchestrator).toContain("holder,assertExecutionOwnership");});
});
