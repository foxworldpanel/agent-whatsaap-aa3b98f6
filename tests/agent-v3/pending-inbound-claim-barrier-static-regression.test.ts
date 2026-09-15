import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914300000_unattached_review_blocks_customer_turn.sql"),
  "utf8",
);

describe("inbound Customer Turn claim barriers", () => {
  it("does not seal collecting while same-conversation pending jobs remain unattached", () => {
    expect(sql.match(/pending_job\.status='pending'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql.match(/agent_customer_turn_messages tm WHERE tm\.job_id=pending_job\.id/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("t.state='collecting' AND t.last_received_at<=p_quiet_before");
  });

  it("also blocks incomplete semantic input already quarantined at Stage B", () => {
    expect(sql.match(/review_job\.status='needs_review'/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("quarantine_customer_turns_with_unattached_review");
  });

  it("keeps retry_safe sealed, cooled down and ahead of later arrivals", () => {
    expect(sql).toContain("t.state='retry_safe'");
    expect(sql).toContain("older.state='retry_safe'");
    expect(sql).toContain("t.updated_at<=now()-interval '15 seconds'");
  });

  it("keeps readiness consistent with actual claimability", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn");
  });
});
