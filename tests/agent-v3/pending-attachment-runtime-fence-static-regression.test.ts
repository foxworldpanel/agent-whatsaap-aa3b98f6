import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914260000_pending_attachment_customer_turn_fence.sql"),
  "utf8",
);

describe("pending Stage B attachment runtime fence", () => {
  it("revalidates incompatible owners under the shared conversation fence", () => {
    const lock = sql.indexOf("pg_try_advisory_xact_lock(hashtextextended(v_job.conversation_id::text,31))");
    const stageB = sql.indexOf("active_job.status IN ('processing_safe','processing')");
    const turns = sql.indexOf("active_turn.state IN ('retry_safe','processing_safe','processing')");
    const generation = sql.indexOf("FROM public.agent_generation_locks generation_lock");
    expect(lock).toBeGreaterThan(-1);
    expect(stageB).toBeGreaterThan(lock);
    expect(turns).toBeGreaterThan(lock);
    expect(generation).toBeGreaterThan(lock);
  });

  it("keeps catch-up bounded and nonblocking", () => {
    expect(sql).toContain("LIMIT least(v_target*4,400)");
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
    expect(sql).toContain("CONTINUE;");
  });
});
