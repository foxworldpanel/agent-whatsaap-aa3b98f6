import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914261500_customer_turn_claim_retry_safe_owner_fence.sql"),
  "utf8",
);

describe("Customer Turn retry_safe claim ordering", () => {
  it("rechecks retry_safe predecessors after acquiring the shared fence", () => {
    const lock = sql.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    const predecessor = sql.indexOf("predecessor.state='retry_safe'", lock);
    const update = sql.indexOf("RETURN QUERY UPDATE public.agent_customer_turns t", lock);
    expect(lock).toBeGreaterThan(-1);
    expect(predecessor).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(predecessor);
  });

  it("retains bounded nonblocking candidate fairness", () => {
    expect(sql).toContain("LIMIT 32");
    expect(sql).toContain("CONTINUE;");
    expect(sql).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
