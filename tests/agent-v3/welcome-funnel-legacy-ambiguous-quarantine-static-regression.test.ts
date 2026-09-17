import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260914421500_quarantine_ambiguous_welcome_funnel_claim.sql",
  "utf8",
);

describe("ambiguous legacy Welcome Funnel quarantine", () => {
  it("requires the canonical conversation fence and generation lock", () => {
    expect(sql).toContain(
      "pg_advisory_xact_lock(\n    hashtextextended(p_conversation_id::text, 31)",
    );
    expect(sql).toContain("FROM public.agent_generation_locks");
    expect(sql).toContain("conversation_id = p_conversation_id");
  });

  it("rejects baseline-compatible and nonexistent legacy claims", () => {
    expect(sql).toContain("welcome_funnel_legacy_claim_baseline");
    expect(sql).toContain("historical Welcome Funnel baseline cannot be quarantined");
    expect(sql).toContain("FROM public.welcome_funnel_runs");
    expect(sql).toContain("quarantine requires a legacy claim");
  });

  it("atomically materializes immutable needs_review state", () => {
    const insert = sql.indexOf("INSERT INTO public.welcome_funnel_execution_state");
    const review = sql.indexOf("SET status = 'needs_review'");
    expect(insert).toBeGreaterThan(0);
    expect(review).toBeGreaterThan(insert);
    expect(sql).toContain("'running'");
    expect(sql).toContain(
      "legacy Welcome Funnel claim has no historical baseline or durable completion evidence",
    );
    expect(sql).toContain("RETURN true");
  });

  it("is callable only by service_role", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.quarantine_ambiguous_welcome_funnel_claim",
    );
    expect(sql).toContain(
      ") FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      ") TO service_role;",
    );
  });
});
