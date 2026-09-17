import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260914423000_stage_b_canonical_claim_entrypoint.sql",
  "utf8",
);

describe("Stage B canonical claim RPC", () => {
  it("routes the legacy service-role entrypoint through the fenced claimant with the real max-attempt bound", () => {
    expect(migration).toContain(
      "FROM public.claim_next_agent_inbound_job_fenced(p_holder, p_max_attempts)",
    );
    expect(migration).not.toContain("2147483647");
    expect(migration).not.toContain("SET status='needs_review'");
  });

  it("keeps the compatibility RPC private to service_role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.claim_next_agent_inbound_job(text,integer)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_next_agent_inbound_job(text,integer)",
    );
    expect(migration).toContain("TO service_role");
  });
});
