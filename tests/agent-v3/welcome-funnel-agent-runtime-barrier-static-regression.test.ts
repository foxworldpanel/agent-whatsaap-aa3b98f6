import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914391500_agent_runtime_welcome_funnel_barrier.sql", "utf8");

describe("durable Welcome Funnel blocks every Agent V3 runtime owner", () => {
 it("fences Customer Turn and Stage B ownership under seed 31", () => {
  expect(migration).toContain("hashtextextended(NEW.conversation_id::text,31)");
  expect(migration).toContain("NEW.state IN ('processing_safe','processing')");
  expect(migration).toContain("NEW.status IN ('processing_safe','processing')");
  expect(migration.match(/status IN \('running','needs_review'\)/g)?.length).toBe(2);
  expect(migration).toContain("agent_customer_turn_welcome_funnel_barrier");
  expect(migration).toContain("agent_inbound_job_welcome_funnel_barrier");
 });
});
