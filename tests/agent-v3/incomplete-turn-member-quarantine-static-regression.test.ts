import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914301500_quarantine_attached_members_with_incomplete_turn.sql"),
  "utf8",
);

describe("incomplete Customer Turn member quarantine", () => {
  it("uses the shared nonblocking conversation fence before quarantine", () => {
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
    expect(sql).toContain("t.state='collecting'");
    expect(sql).toContain("j.status='needs_review'");
    expect(sql).toContain("NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages tm WHERE tm.job_id=j.id)");
  });

  it("moves already attached pending members to review with the quarantined turn", () => {
    expect(sql).toContain("UPDATE public.agent_inbound_jobs j");
    expect(sql).toContain("SET status='needs_review',claimed_by=NULL,claimed_at=NULL");
    expect(sql).toContain("WHERE j.status='pending'");
    expect(sql).toContain("tm.turn_id=v_candidate.id AND tm.job_id=j.id");
    expect(sql).toContain("v_count:=v_count+1");
  });

  it("keeps the repair service-role only", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.quarantine_customer_turns_with_unattached_review(integer) FROM PUBLIC,anon,authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.quarantine_customer_turns_with_unattached_review(integer) TO service_role");
  });
});
