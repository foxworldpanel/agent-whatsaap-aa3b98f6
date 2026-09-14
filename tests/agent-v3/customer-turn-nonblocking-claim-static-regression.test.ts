import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914241500_customer_turn_claim_nonblocking_fence.sql"),
  "utf8",
);

describe("Customer Turn background claim contention", () => {
  it("does not block the queue scan behind one conversation advisory fence", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_next_agent_customer_turn");
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
    expect(migration).not.toContain("PERFORM pg_advisory_xact_lock(hashtextextended(v_conversation_id::text,31))");
  });

  it("still revalidates all durable runtime owners after acquiring the fence", () => {
    expect(migration).toContain("active_turn.state IN ('processing_safe','processing')");
    expect(migration).toContain("active_job.status IN ('processing_safe','processing')");
    expect(migration).toContain("FROM public.agent_generation_locks generation_lock");
    expect(migration).toContain("FROM public.agent_generation_locks g");
  });
});
