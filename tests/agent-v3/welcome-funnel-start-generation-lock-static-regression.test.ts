import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/20260914413000_welcome_funnel_start_requires_generation_lock.sql","utf8");
describe("Welcome Funnel durable start ownership",()=>{it("requires the canonical conversation generation lock before running state can exist",()=>{expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text,31))");expect(migration).toContain("agent_generation_locks");expect(migration).toContain("Welcome Funnel start requires conversation generation lock");expect(migration).toContain("processing_safe','processing");});});
