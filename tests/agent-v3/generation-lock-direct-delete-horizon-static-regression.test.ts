import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260914373000_generation_lock_minimum_lease_guard.sql","utf8");
const webhook=readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");

describe("generation lock direct-delete lease boundary",()=>{
 it("neutralizes the legacy webhook five-minute cleanup at the database boundary",()=>{
  expect(webhook).toContain("DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000");
  expect(migration).toContain("interval '20 minutes'");
  expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(OLD.conversation_id::text,31))");
  expect(migration).toContain("agent_v3.release_conversation_id");
  expect(migration).toContain("agent_v3.release_holder");
  expect(migration).toContain("ERRCODE='55000'");
 });
});
