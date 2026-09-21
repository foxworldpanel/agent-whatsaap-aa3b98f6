import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914331500_customer_turn_execution_snapshot_complete.sql"), "utf8");
const constraints = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914333000_complete_snapshot_quarantine_and_constraints.sql"), "utf8");
const runtime = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/customer-turn-runtime.server.ts"), "utf8");
const turn = readFileSync(resolve(process.cwd(), "src/lib/agent-v3/customer-turn.server.ts"), "utf8");

describe("complete Customer Turn execution snapshot", () => {
  it("snapshots and freezes send target plus deferred-funnel semantics", () => {
    expect(migration).toContain("NEW.send_target:=v_job.send_target");
    expect(migration).toContain("NEW.deferred_funnel:=v_job.deferred_funnel");
    expect(migration).toContain("NEW.send_target IS DISTINCT FROM OLD.send_target");
    expect(migration).toContain("NEW.deferred_funnel IS DISTINCT FROM OLD.deferred_funnel");
    expect(turn).toContain("send_target:string; deferred_funnel:boolean");
  });

  it("executes deferred funnel and outbound target from sealed membership", () => {
    expect(runtime).toContain(".filter((member) => member.deferred_funnel)");
    expect(runtime).toMatch(/sendTarget\s*:\s*last\.send_target/);
    expect(runtime).not.toContain("job?.deferred_funnel");
  });

  it("fails safe if mutable routing identity drifts", () => {
    expect(runtime).toContain("job.send_target !== member.send_target");
    expect(runtime).toContain("memberContext.message.externalId !== member.external_id");
  });

  it("quarantines incomplete legacy snapshots and protects new writes", () => {
    expect(constraints).toContain("agent_customer_turn_member_send_target_present");
    expect(constraints).toContain("agent_customer_turn_member_deferred_funnel_present");
    expect(constraints).toContain("NOT VALID");
    expect(constraints).toContain("tm.deferred_funnel IS NULL");
    expect(constraints).toContain("pg_try_advisory_xact_lock(hashtextextended(v_candidate.conversation_id::text,31))");
  });
});
