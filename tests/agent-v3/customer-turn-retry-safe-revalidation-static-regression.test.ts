import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914273000_customer_turn_claim_retry_safe_revalidation_fix.sql"),
  "utf8",
);

describe("Customer Turn retry_safe claim ordering", () => {
  it("rechecks semantic ownership after acquiring the shared fence", () => {
    const lock = sql.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    const current = sql.indexOf("current_turn.state='collecting'", lock);
    const older = sql.indexOf("current_turn.state='retry_safe'", lock);
    const update = sql.indexOf("RETURN QUERY UPDATE public.agent_customer_turns t", lock);
    expect(lock).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(lock);
    expect(older).toBeGreaterThan(current);
    expect(update).toBeGreaterThan(older);
  });

  it("blocks collecting behind any retry_safe but retry_safe only behind an older retry_safe", () => {
    expect(sql).toContain("current_turn.state='collecting' AND EXISTS(");
    expect(sql).toContain("retry_owner.state='retry_safe'");
    expect(sql).toContain("current_turn.state='retry_safe' AND EXISTS(");
    expect(sql).toContain("older_retry.state='retry_safe'");
    expect(sql).toContain("(older_retry.created_at,older_retry.id)<(current_turn.created_at,current_turn.id)");
    expect(sql).not.toContain("predecessor.state='retry_safe'");
  });

  it("retains bounded nonblocking candidate fairness", () => {
    expect(sql).toContain("LIMIT 32");
    expect(sql).toContain("CONTINUE;");
    expect(sql).toContain("IF FOUND THEN RETURN; END IF;");
  });
});
