import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914274500_pending_attachment_fairness_by_conversation.sql"),
  "utf8",
);

describe("pending Stage B attachment runtime fence", () => {
  it("revalidates incompatible owners under the shared conversation fence", () => {
    const lock = sql.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31))");
    const stageB = sql.indexOf("active_job.status IN ('processing_safe','processing')", lock);
    const turns = sql.indexOf("active_turn.state IN ('retry_safe','processing_safe','processing')", lock);
    const generation = sql.indexOf("FROM public.agent_generation_locks generation_lock", lock);
    expect(lock).toBeGreaterThan(-1);
    expect(stageB).toBeGreaterThan(lock);
    expect(turns).toBeGreaterThan(stageB);
    expect(generation).toBeGreaterThan(turns);
  });

  it("keeps catch-up bounded, per-conversation fair and nonblocking", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id)");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
    expect(sql).toContain("CONTINUE;");
  });
});
