import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const acquire=readFileSync("supabase/migrations/20260914460000_generation_lock_acquire_welcome_funnel_fence.sql","utf8");
const source=readFileSync("src/lib/agent-v3/conversation-lock.server.ts","utf8");
describe("generation lock stale replacement contract",()=>{
 it("application and database agree on caller-supplied canonical stale cutoff",()=>{
  expect(source).toContain("DB_CONVERSATION_LOCK_STALE_MS = 20 * 60 * 1000");
  expect(source).toContain("p_stale_before: staleBefore");
  expect(acquire).toContain("IF v_acquired_at>=p_stale_before THEN RETURN false");
 });
});
