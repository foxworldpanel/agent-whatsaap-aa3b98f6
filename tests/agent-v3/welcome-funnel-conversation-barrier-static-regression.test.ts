import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914390000_welcome_funnel_conversation_barrier.sql", "utf8");

describe("Welcome Funnel conversation barrier", () => {
  it("fails closed for running and uncertain durable executions", () => {
    expect(migration).toContain("status='needs_review'");
    expect(migration).toContain("THEN 'needs_review'");
    expect(migration).toContain("status='running'");
    expect(migration).toContain("THEN 'running'");
    expect(migration).toContain("ELSE 'clear'");
  });
});
