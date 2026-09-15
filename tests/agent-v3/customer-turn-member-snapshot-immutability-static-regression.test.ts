import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const immutableSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914320000_customer_turn_member_snapshot_immutability.sql"), "utf8");
const identitySql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914321500_customer_turn_member_snapshot_identity_guard.sql"), "utf8");

describe("Customer Turn member snapshot integrity", () => {
  it("rejects updates to semantic identity while allowing resolved_text cache writes", () => {
    for (const field of ["turn_id", "job_id", "message_id", "ordinal", "external_id", "input_text", "input_kind", "input_mime", "audio_url", "created_at"]) {
      expect(immutableSql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(immutableSql).not.toContain("NEW.resolved_text IS DISTINCT FROM OLD.resolved_text");
    expect(immutableSql).toContain("BEFORE UPDATE ON public.agent_customer_turn_messages");
  });

  it("validates message, job and turn tenant identity before snapshot creation", () => {
    expect(identitySql).toContain("v_message.conversation_id IS DISTINCT FROM v_job.conversation_id");
    expect(identitySql).toContain("v_message.workspace_id IS DISTINCT FROM v_job.workspace_id");
    expect(identitySql).toContain("t.conversation_id=v_job.conversation_id");
    expect(identitySql).toContain("t.workspace_id=v_job.workspace_id");
    expect(identitySql).toContain("Customer Turn member external identity missing");
  });
});
