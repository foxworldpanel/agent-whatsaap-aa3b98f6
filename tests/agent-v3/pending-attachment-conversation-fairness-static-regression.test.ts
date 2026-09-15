import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914274500_pending_attachment_fairness_by_conversation.sql"),
  "utf8",
);

describe("pending Stage B attachment fairness by conversation", () => {
  it("chooses only the oldest pending unattached representative per conversation", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id) j.id,j.conversation_id,j.created_at");
    expect(sql).toContain("ORDER BY j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY candidate.created_at,candidate.id");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
  });

  it("skips contended conversations under the shared fence", () => {
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
  });

  it("revalidates runtime owners before attaching semantic work", () => {
    expect(sql).toContain("active_job.status IN ('processing_safe','processing')");
    expect(sql).toContain("active_turn.state IN ('retry_safe','processing_safe','processing')");
    expect(sql).toContain("FROM public.agent_generation_locks generation_lock");
  });
});
