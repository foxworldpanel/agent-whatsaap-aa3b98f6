import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914281500_stage_b_claim_generation_lock_fence.sql"), "utf8");

describe("legacy Stage B generation ownership fence", () => {
  it("blocks specific claims behind an existing generation owner", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_agent_inbound_job(");
    expect(sql).toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    const specific = sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job"));
    expect(specific.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("prefilters and revalidates generation ownership for background claims", () => {
    const background = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job"));
    expect(background).toContain("LIMIT 32");
    expect(background).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(background.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(background).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
