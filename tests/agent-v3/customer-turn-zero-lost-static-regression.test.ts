import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

const retryState = migration("20260914194500_retry_safe_customer_turn_state.sql");
const stageBFence = migration("20260914200000_retry_safe_blocks_stage_b_fallback.sql");
const retryOrder = migration("20260914203000_customer_turn_retry_order_fence.sql");
const boundedRetry = migration("20260914211500_bound_customer_turn_safe_retries.sql");
const runtimeBoundary = migration("20260914191500_safe_pre_runtime_customer_turn_recovery.sql");
const lockOrder = migration("20260914182500_customer_turn_lock_order.sql");

describe("Stage C zero-lost-turn static invariants", () => {
  it("uses the same conversation advisory-lock namespace", () => {
    for (const sql of [lockOrder, retryState, stageBFence, retryOrder, boundedRetry]) {
      expect(sql).toContain("hashtextextended(v_conversation_id::text,31)");
    }
  });

  it("keeps safe pre-runtime recovery sealed as retry_safe", () => {
    expect(retryState).toContain("SET state='retry_safe'");
    expect(retryState).toContain("WHERE id=v_candidate.id AND state='processing_safe'");
    expect(retryState).toContain("SET state='needs_review'");
    expect(retryState).toContain("WHERE id=v_candidate.id AND state='processing'");
  });

  it("prevents collecting work from overtaking retry_safe work", () => {
    expect(retryOrder).toContain("older.state='retry_safe'");
    expect(retryOrder).toContain("(older.created_at,older.id)<(t.created_at,t.id)");
    expect(retryOrder).toContain("t.state='collecting' AND t.last_received_at<=p_quiet_before");
  });

  it("bounds crash-only retries before the runtime boundary", () => {
    expect(boundedRetry).toContain("safe_attempt_count integer NOT NULL DEFAULT 0");
    expect(boundedRetry.match(/safe_attempt_count<5/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(boundedRetry).toContain("safe_attempt_count=t.safe_attempt_count+1");
    expect(boundedRetry).toContain("max safe pre-runtime customer turn attempts exceeded");
    expect(boundedRetry).toContain("ELSE 'needs_review' END");
  });

  it("keeps Stage B fallback behind semantic retry ownership", () => {
    expect(stageBFence.match(/t\.state IN \('retry_safe','processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(stageBFence).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)");
  });

  it("has an explicit runtime side-effect boundary", () => {
    expect(runtimeBoundary).toContain("CREATE OR REPLACE FUNCTION public.enter_agent_customer_turn_runtime");
    expect(runtimeBoundary).toContain("WHERE id=p_turn_id AND state='processing_safe' AND claimed_by=p_holder");
    expect(runtimeBoundary).toContain("SET state='processing',updated_at=now()");
  });
});
