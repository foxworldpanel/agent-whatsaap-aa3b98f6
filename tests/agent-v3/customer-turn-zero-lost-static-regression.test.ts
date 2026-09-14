import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

const retryState = migration("20260914194500_retry_safe_customer_turn_state.sql");
const stageBFence = migration("20260914200000_retry_safe_blocks_stage_b_fallback.sql");
const retryOrder = migration("20260914203000_customer_turn_retry_order_fence.sql");
const boundedRetry = migration("20260914211500_bound_customer_turn_safe_retries.sql");
const generationFence = migration("20260914214500_unify_generation_lock_customer_turn_fence.sql");
const stageBRecoveryFence = migration("20260914220000_unify_stage_b_recovery_customer_turn_fence.sql");
const ownerSafeRelease = migration("20260914223000_owner_safe_generation_lock_release.sql");
const claimGenerationFence = migration("20260914224500_generation_lock_blocks_customer_turn_claims.sql");
const insertGenerationFence = migration("20260914230000_generation_lock_insert_customer_turn_fence.sql");
const readyProbeFence = migration("20260914233000_customer_turn_ready_probe_runtime_fences.sql");
const claimFenceSkip = migration("20260914234500_customer_turn_claim_skips_fenced_conversations.sql");
const runtimeBoundary = migration("20260914191500_safe_pre_runtime_customer_turn_recovery.sql");
const lockOrder = migration("20260914182500_customer_turn_lock_order.sql");

describe("Stage C zero-lost-turn static invariants", () => {
  it("uses the same conversation advisory-lock namespace", () => {
    for (const sql of [lockOrder, retryState, stageBFence, retryOrder, boundedRetry, claimFenceSkip]) {
      expect(sql).toContain("hashtextextended(v_conversation_id::text,31)");
    }
    expect(generationFence).toContain("hashtextextended(p_conversation_id::text,31)");
    expect(stageBRecoveryFence).toContain("hashtextextended(v_stale_conversation::text,31)");
    expect(ownerSafeRelease).toContain("hashtextextended(p_conversation_id::text,31)");
    expect(claimGenerationFence).toContain("hashtextextended(v_conversation_id::text,31)");
    expect(insertGenerationFence).toContain("hashtextextended(NEW.conversation_id::text,31)");
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

  it("prevents generation-lock cleanup while a Customer Turn owns runtime", () => {
    expect(generationFence).toContain("CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_delete");
    expect(generationFence).toContain("CREATE OR REPLACE FUNCTION public.acquire_agent_conversation_lock");
    expect(generationFence.match(/t\.state IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(stageBRecoveryFence).toContain("active_turn.state IN ('processing_safe','processing')");
  });

  it("allows only the exact generation-lock owner to release under the shared fence", () => {
    expect(ownerSafeRelease).toContain("CREATE OR REPLACE FUNCTION public.release_agent_conversation_lock");
    expect(ownerSafeRelease).toContain("IF v_current_holder<>p_holder THEN RETURN true; END IF;");
    expect(ownerSafeRelease).toContain("agent_v3.release_conversation_id");
    expect(ownerSafeRelease).toContain("agent_v3.release_holder");
    expect(ownerSafeRelease).toContain("WHERE conversation_id=p_conversation_id AND holder=p_holder");
  });

  it("serializes Welcome Funnel generation ownership against Customer Turn claims", () => {
    expect(claimGenerationFence.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(insertGenerationFence).toContain("CREATE OR REPLACE FUNCTION public.guard_agent_generation_lock_insert");
    expect(insertGenerationFence).toContain("BEFORE INSERT ON public.agent_generation_locks");
    expect(insertGenerationFence).toContain("t.state IN ('processing_safe','processing')");
  });

  it("reports ready work only when no runtime owner currently fences it", () => {
    expect(readyProbeFence).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
    expect(readyProbeFence).toContain("active_turn.state IN ('processing_safe','processing')");
    expect(readyProbeFence).toContain("active_job.status IN ('processing_safe','processing')");
    expect(readyProbeFence).toContain("FROM public.agent_generation_locks generation_lock");
    expect(readyProbeFence).toContain("generation_lock.conversation_id=t.conversation_id");
  });

  it("skips fenced conversations before choosing the next global candidate", () => {
    expect(claimFenceSkip.match(/active_turn\.state IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(claimFenceSkip.match(/active_job\.status IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(claimFenceSkip.match(/FROM public\.agent_generation_locks generation_lock/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(claimFenceSkip).toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    expect(claimFenceSkip).toContain("Discovery filters are only an optimization");
  });

  it("has an explicit runtime side-effect boundary", () => {
    expect(runtimeBoundary).toContain("CREATE OR REPLACE FUNCTION public.enter_agent_customer_turn_runtime");
    expect(runtimeBoundary).toContain("WHERE id=p_turn_id AND state='processing_safe' AND claimed_by=p_holder");
    expect(runtimeBoundary).toContain("SET state='processing',updated_at=now()");
  });
});
