import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const sql=readFileSync("supabase/migrations/20260914441500_welcome_funnel_stale_recovery_no_lock_steal.sql","utf8");
describe("Welcome Funnel stale recovery lock ownership",()=>{
 it("uses the canonical nonblocking conversation fence",()=>{expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v.conversation_id::text,31))");});
 it("never quarantines while any generation-lock row still exists",()=>{expect(sql).toContain("IF EXISTS(\n   SELECT 1 FROM public.agent_generation_locks g\n   WHERE g.conversation_id=v.conversation_id\n  ) THEN CONTINUE");expect(sql).toContain("AND NOT EXISTS(\n      SELECT 1 FROM public.agent_generation_locks g\n      WHERE g.conversation_id=v.conversation_id\n     )");});
 it("does not use lock age as permission to steal ownership",()=>{expect(sql).not.toContain("g.acquired_at>=p_generation_lock_stale_before");expect(sql).not.toContain("g.acquired_at<p_generation_lock_stale_before");});
});
