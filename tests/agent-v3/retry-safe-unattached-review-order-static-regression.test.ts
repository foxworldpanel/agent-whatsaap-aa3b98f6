import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914310000_retry_safe_unattached_review_order_fence.sql"), "utf8");

describe("retry-safe unattached review ordering", () => {
  it("blocks retry-safe only behind review ingress that existed by seal time", () => {
    expect(sql).toContain("j.created_at<=p_cutoff");
    expect(sql).toContain("agent_turn_has_blocking_unattached_review(t.conversation_id,t.sealed_at)");
    expect(sql).toContain("agent_turn_has_blocking_unattached_review(v_conversation_id,t.sealed_at)");
  });

  it("keeps collecting turns blocked behind any unattached review ingress", () => {
    expect(sql).toContain("agent_turn_has_blocking_unattached_review(t.conversation_id,NULL)");
    expect(sql).toContain("agent_turn_has_blocking_unattached_review(v_conversation_id,NULL)");
  });

  it("quarantines affected collecting or retry-safe turns under seed31", () => {
    expect(sql).toContain("t.state='retry_safe'");
    expect(sql).toContain("t.state='collecting'");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("state='needs_review'");
  });

  it("preserves nonblocking background claim and service-role-only access", () => {
    expect(sql).toContain("LIMIT 32");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_next_agent_customer_turn(text,timestamptz) TO service_role");
  });
});
