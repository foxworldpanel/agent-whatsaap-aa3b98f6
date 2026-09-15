import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914274500_pending_attachment_fairness_by_conversation.sql"),
  "utf8",
);

describe("pending Stage B to Customer Turn attachment sweep", () => {
  it("selects one oldest representative per conversation and looks beyond contention", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id) j.id,j.conversation_id,j.created_at");
    expect(sql).toContain("ORDER BY j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY candidate.created_at,candidate.id");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
  });

  it("revalidates the job and preserves one durable membership under the fence", () => {
    expect(sql).toContain("FOR UPDATE;");
    expect(sql).toContain("v_locked_job.status<>'pending'");
    expect(sql).toContain("FROM public.agent_customer_turn_messages");
    expect(sql).toContain("WHERE job_id=v_job.id");
    expect(sql).toContain("WHERE conversation_id=v_job.conversation_id AND state='collecting'");
    expect(sql).toContain("INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)");
  });
});
