import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914283000_pending_inbound_blocks_customer_turn_claim.sql"),
  "utf8",
);

describe("pending inbound Customer Turn claim barrier", () => {
  it("does not seal a collecting turn while same-conversation pending jobs remain unattached", () => {
    expect(sql.match(/pending_job\.status='pending'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql.match(/agent_customer_turn_messages tm WHERE tm\.job_id=pending_job\.id/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("current_turn.state='collecting'");
    expect(sql).toContain("t.state='collecting' AND t.last_received_at<=p_quiet_before");
  });

  it("keeps retry_safe sealed and ahead of later arrivals", () => {
    expect(sql).toContain("t.state='retry_safe'");
    expect(sql).toContain("older_retry.state='retry_safe'");
    expect(sql).toContain("older.state='retry_safe'");
  });

  it("keeps readiness consistent with actual claimability", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.has_ready_agent_customer_turn");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_agent_customer_turn");
  });
});
