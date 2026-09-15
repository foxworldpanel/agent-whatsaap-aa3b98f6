import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914303000_generation_lock_lease_refresh.sql"), "utf8");
const lockServer = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/conversation-lock.server.ts"), "utf8");

describe("generation lock lease refresh", () => {
  it("refreshes only the exact holder under the canonical conversation fence", () => {
    expect(migration).toContain("refresh_agent_conversation_lock");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31))");
    expect(migration).toContain("WHERE conversation_id=p_conversation_id AND holder=p_holder");
    expect(migration).toContain("SET acquired_at=now()");
  });

  it("keeps refresh service-role only and resolves transport uncertainty durably", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.refresh_agent_conversation_lock(uuid,text) TO service_role");
    expect(lockServer).toContain('"refresh_agent_conversation_lock"');
    expect(lockServer).toContain("if (current?.holder === holder) return true");
  });
});
