import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260914491500_welcome_funnel_single_running_per_conversation.sql", "utf8");

describe("Welcome Funnel single-running conversation invariant", () => {
  it("quarantines every historically ambiguous duplicate running execution", () => {
    expect(sql).toContain("HAVING count(*)>1");
    expect(sql).toContain("SET status='needs_review'");
    expect(sql).toContain("WHERE s.conversation_id=d.conversation_id");
    expect(sql).toContain("AND s.status='running'");
    expect(sql).not.toContain("row_number()");
  });

  it("installs a structural one-running-row-per-conversation fence", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS welcome_funnel_execution_one_running_per_conversation");
    expect(sql).toContain("ON public.welcome_funnel_execution_state(conversation_id)");
    expect(sql).toContain("WHERE status='running'");
  });
});
