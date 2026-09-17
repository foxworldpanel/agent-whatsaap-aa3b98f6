import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260914451500_generation_lock_delete_guard_welcome_funnel.sql","utf8");

describe("generation lock direct-delete lease boundary",()=>{
 it("enforces the canonical lease and exact-owner release capability at the database boundary",()=>{
  expect(migration).toContain("interval '20 minutes'");
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(OLD.conversation_id::text,31))");
  expect(migration).toContain("agent_v3.release_conversation_id");
  expect(migration).toContain("agent_v3.release_holder");
  expect(migration).toContain("ERRCODE='55000'");
 });
 it("preserves every durable runtime owner from arbitrary direct deletion",()=>{
  expect(migration).toContain("j.status IN ('processing_safe','processing')");
  expect(migration).toContain("t.state IN ('processing_safe','processing')");
  expect(migration).toContain("f.status='running'");
 });
});
