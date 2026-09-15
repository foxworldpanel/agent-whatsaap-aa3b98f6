import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914354500_stage_b_transition_conversation_fence.sql","utf8");
const source=readFileSync("src/lib/agent-v3/inbound-jobs.server.ts","utf8");
describe("Stage B ownership transition fence",()=>{
 it("uses seed 31 RPCs for safe release, review, completion and runtime review",()=>{
  expect((migration.match(/hashtextextended\(v_conversation_id::text,31\)/g)||[]).length).toBe(4);
  for(const rpc of ["release_agent_inbound_job_safe","review_agent_inbound_job_safe","complete_agent_inbound_job","review_agent_inbound_job_runtime"]){expect(migration).toContain(`FUNCTION public.${rpc}`);expect(source).toContain(`\"${rpc}\"`);}
 });
 it("refuses direct Stage B finalization once a job belongs to a semantic Customer Turn",()=>{expect((migration.match(/NOT EXISTS\(SELECT 1 FROM public\.agent_customer_turn_messages tm WHERE tm\.job_id=agent_inbound_jobs\.id\)/g)||[]).length).toBe(4);});
 it("does not mutate Stage B ownership directly through REST updates",()=>{expect(source).not.toContain('.from("agent_inbound_jobs").update({status:');});
});
