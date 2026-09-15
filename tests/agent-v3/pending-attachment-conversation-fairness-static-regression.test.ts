import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914293000_drain_pending_attachment_by_conversation.sql"),
  "utf8",
);

describe("pending Stage B attachment fairness by conversation", () => {
  it("chooses one oldest representative per conversation before taking its fence", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id) j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY candidate.created_at,candidate.id");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31))");
  });

  it("drains multiple pending jobs from a winning conversation into one collecting turn", () => {
    expect(sql).toContain("FOR v_job IN");
    expect(sql).toContain("j.conversation_id=v_conversation.conversation_id AND j.status='pending'");
    expect(sql).toContain("ORDER BY j.created_at,j.id");
    expect(sql).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(sql).toContain("INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)");
    expect(sql).toContain("ON CONFLICT (job_id) DO NOTHING");
  });

  it("revalidates runtime owners while the shared conversation fence remains held", () => {
    expect(sql.match(/active_job\.status IN \('processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql.match(/active_turn\.state IN \('retry_safe','processing_safe','processing'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql.match(/public\.agent_generation_locks generation_lock/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
  });
});
