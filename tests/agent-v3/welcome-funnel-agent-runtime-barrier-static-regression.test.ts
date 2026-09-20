import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const historical=readFileSync("supabase/migrations/20260914391500_agent_runtime_welcome_funnel_barrier.sql","utf8");
const finalBarrier=readFileSync("supabase/migrations/20260914543000_background_funnel_user_identity_barrier.sql","utf8");
const finalStart=readFileSync("supabase/migrations/20260914521500_welcome_funnel_start_primary_identity_fence.sql","utf8");

describe("durable Welcome Funnel blocks every Agent V3 runtime owner",()=>{
 it("historically fences Customer Turn and Stage B ownership under seed 31",()=>{
  expect(historical).toContain("hashtextextended(NEW.conversation_id::text,31)");
  expect(historical).toContain("NEW.state IN ('processing_safe','processing')");
  expect(historical).toContain("NEW.status IN ('processing_safe','processing')");
  expect(historical.match(/status IN \('running','needs_review'\)/g)?.length).toBe(2);
  expect(historical).toContain("agent_customer_turn_welcome_funnel_barrier");
  expect(historical).toContain("agent_inbound_job_welcome_funnel_barrier");
 });
 it("final shared barrier treats missing or mismatched current routing identity as owned",()=>{
  expect(finalBarrier).toContain("SELECT c.user_id INTO v_user_id");
  expect(finalBarrier).toContain("IF NOT FOUND OR v_user_id IS NULL THEN RETURN true");
  expect(finalBarrier).toContain("s.workspace_id IS DISTINCT FROM p_workspace_id");
  expect(finalBarrier).toContain("s.user_id IS DISTINCT FROM v_user_id");
  expect(finalBarrier).toContain("s.status IN('running','needs_review')");
 });
 it("symmetric final Funnel start rejects active Agent runtime under the same seed-31 namespace",()=>{
  expect(finalStart).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect(finalStart).toContain("agent_customer_turns WHERE conversation_id=p_conversation_id AND state IN('processing_safe','processing')");
  expect(finalStart).toContain("agent_inbound_jobs WHERE conversation_id=p_conversation_id AND status IN('processing_safe','processing')");
 });
});
