import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914293000_drain_pending_attachment_by_conversation.sql"),
  "utf8",
);

describe("pending Stage B to Customer Turn attachment sweep", () => {
  it("keeps fairness between conversations while scanning beyond contention", () => {
    expect(sql).toContain("SELECT DISTINCT ON (j.conversation_id) j.conversation_id,j.created_at,j.id");
    expect(sql).toContain("ORDER BY candidate.created_at,candidate.id");
    expect(sql).toContain("LIMIT least(v_target*10,1000)");
    expect(sql).toContain("EXIT WHEN v_count>=v_target");
    expect(sql).toContain("pg_try_advisory_xact_lock(hashtextextended(v_conversation.conversation_id::text,31))");
    expect(sql).toContain("CONTINUE;");
  });

  it("locks pending jobs and attaches them idempotently to one collecting turn", () => {
    expect(sql).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(sql).toContain("WHERE conversation_id=v_conversation.conversation_id AND state='collecting'");
    expect(sql).toContain("INSERT INTO public.agent_customer_turn_messages(turn_id,job_id,message_id)");
    expect(sql).toContain("ON CONFLICT (job_id) DO NOTHING");
    expect(sql).toContain("IF FOUND THEN");
    expect(sql).toContain("SET last_received_at=now(),updated_at=now()");
  });
});
