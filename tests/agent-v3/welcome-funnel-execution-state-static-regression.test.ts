import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20260914353000_welcome_funnel_execution_state.sql","utf8");

describe("Welcome Funnel durable execution state",()=>{
 it("does not overload the five-column legacy claim table",()=>{
  expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.welcome_funnel_execution_state");
  expect(migration).toContain("status text NOT NULL CHECK(status IN ('running','completed','needs_review'))");
  expect(migration).toContain("last_completed_step text NULL");
  expect(migration).toContain("PRIMARY KEY(funnel_id,contact_id)");
  expect(migration).not.toContain("ALTER TABLE public.welcome_funnel_runs ADD COLUMN");
 });
});
