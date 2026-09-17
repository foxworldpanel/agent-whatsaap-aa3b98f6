import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914493000_welcome_funnel_start_single_running_fence.sql", "utf8");

describe("Welcome Funnel start conversation exclusivity", () => {
  it("checks exact holder before any runtime ownership decision", () => {
    const advisory = sql.indexOf("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 31))");
    const holder = sql.indexOf("conversation_id = p_conversation_id AND holder = p_holder");
    const funnel = sql.indexOf("status = 'running'");
    expect(advisory).toBeGreaterThan(-1);
    expect(holder).toBeGreaterThan(advisory);
    expect(funnel).toBeGreaterThan(holder);
  });

  it("blocks a second running Funnel for the conversation before INSERT", () => {
    const barrier = sql.indexOf("Welcome Funnel start blocked by active Funnel execution");
    const insert = sql.indexOf("INSERT INTO public.welcome_funnel_execution_state");
    expect(barrier).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(barrier);
    expect(sql).toContain("WHERE conversation_id = p_conversation_id AND status = 'running'");
  });

  it("retains Stage B and Customer Turn active-runtime fences", () => {
    expect(sql).toContain("FROM public.agent_customer_turns");
    expect(sql).toContain("state IN ('processing_safe','processing')");
    expect(sql).toContain("FROM public.agent_inbound_jobs");
    expect(sql).toContain("status IN ('processing_safe','processing')");
  });
});
