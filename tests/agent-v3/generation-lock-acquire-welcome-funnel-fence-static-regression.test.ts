import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");

describe("canonical generation lock acquisition Welcome Funnel fence",()=>{
 it("refuses both missing-lock insertion and stale replacement while Funnel owns conversation",()=>{
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
  expect((migration.match(/f\.status='running'/g)||[]).length).toBeGreaterThanOrEqual(2);
  expect(migration).toContain("v_acquired_at>=p_stale_before");
  expect(migration).toContain("set_config('agent_v3.release_holder',v_current_holder,true)");
 });
});
