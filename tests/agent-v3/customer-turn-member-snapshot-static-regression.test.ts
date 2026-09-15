import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914314500_customer_turn_member_snapshot_integrity.sql"), "utf8");

describe("Customer Turn durable member snapshot", () => {
  it("snapshots semantic execution fields at attachment time", () => {
    expect(sql).toContain("BEFORE INSERT ON public.agent_customer_turn_messages");
    expect(sql).toContain("NEW.external_id:=v_message.external_id");
    expect(sql).toContain("NEW.input_text:=v_job.input_text");
    expect(sql).toContain("NEW.input_kind:=v_job.input_kind");
    expect(sql).toContain("NEW.input_mime:=v_job.input_mime");
    expect(sql).toContain("NEW.audio_url:=v_message.audio_url");
  });

  it("rejects job/message identity mismatch while snapshotting", () => {
    expect(sql).toContain("v_job.message_id<>NEW.message_id");
    expect(sql).toContain("Customer Turn member/job identity mismatch");
  });

  it("loads runtime members only from the immutable membership snapshot in ordinal order", () => {
    const loadBody = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.load_agent_customer_turn_members"));
    expect(loadBody).toContain("FROM public.agent_customer_turn_messages tm");
    expect(loadBody).not.toContain("JOIN public.agent_inbound_jobs");
    expect(loadBody).not.toContain("JOIN public.messages");
    expect(loadBody).toContain("ORDER BY tm.ordinal");
  });
});
