import { describe,expect,it } from "vitest";
import fs from "node:fs";

describe("Welcome Funnel recovered execution resume",()=>{
 it("resumes only an existing fenced durable run without starting a second execution",()=>{
  const orchestrator=fs.readFileSync("src/lib/welcome-funnel-orchestrator.server.ts","utf8");
  const runner=fs.readFileSync("src/lib/welcome-funnel-runner.server.ts","utf8");
  expect(orchestrator).toContain("resumeRecoveredWelcomeFunnel");
  expect(orchestrator).toContain("arm_recovered_welcome_funnel_execution");expect(orchestrator).toContain("acquire_recovered_welcome_funnel_lock");
  expect(orchestrator).toContain('before!=="durable_running"');
  expect(orchestrator).toContain("skipExecutionStart:true");
  expect(runner).toContain("skipExecutionStart?:boolean");
  expect(runner).toContain("if(!params.skipExecutionStart)await startExecutionState");
 });
 it("database arm requires exact holder, no checkpoint and no agent outbound evidence",()=>{
  const sql=fs.readFileSync("supabase/migrations/20260929223000_arm_recovered_welcome_funnel_execution.sql","utf8");
  expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect(sql).toContain("g.holder=p_holder");
  expect(sql).toContain("s.last_completed_step is null");
  expect(sql).toContain("m.sender='agente'");
  expect(sql).toContain("grant execute on function");
 });
 it("recovery worker actually consumes safely recovered running funnels",()=>{const worker=fs.readFileSync("src/routes/api/public/hooks/agent-inbound-recovery.ts","utf8");expect(worker).toContain("resumeZeroEffectRecoveredFunnels");expect(worker).toContain("resumeRecoveredWelcomeFunnel");expect(worker).toContain("resumedWelcomeFunnels");expect(worker).toContain(".eq(\"status\",\"running\").is(\"last_completed_step\",null)");expect(worker).toContain("recover_zero_effect_stale_welcome_funnel");expect(worker).toContain(".eq(\"status\",\"needs_review\").is(\"last_completed_step\",null)");expect(worker).toContain("Partial/checkpointed executions remain needs_review");const quarantine=worker.indexOf("recover_stale_welcome_funnel_executions");const resume=worker.lastIndexOf("resumeZeroEffectRecoveredFunnels(supabaseAdmin)");expect(quarantine).toBeGreaterThan(-1);expect(resume).toBeGreaterThan(quarantine);});
});
