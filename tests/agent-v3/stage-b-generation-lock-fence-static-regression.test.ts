import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8");
// The specific/manual claim is still defined by 142815; the background claim was
// superseded by 142845 to add per-conversation fairness while retaining its fences.
const specificMigration = read("20260914281500_stage_b_claim_generation_lock_fence.sql");
const backgroundMigration = read("20260914284500_stage_b_claim_fairness_by_conversation.sql");

describe("legacy Stage B generation ownership fence", () => {
  it("blocks specific claims behind an existing generation owner", () => {
    expect(specificMigration).toContain("CREATE OR REPLACE FUNCTION public.claim_agent_inbound_job(");
    expect(specificMigration).toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    const specific = specificMigration.slice(0, specificMigration.indexOf("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job"));
    expect(specific.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("prefilters and revalidates generation ownership for the effective background claim", () => {
    expect(backgroundMigration).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_inbound_job");
    expect(backgroundMigration).toContain("SELECT DISTINCT ON (j.conversation_id)");
    expect(backgroundMigration).toContain("LIMIT 64");
    expect(backgroundMigration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(backgroundMigration.match(/public\.agent_generation_locks g/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(backgroundMigration).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
