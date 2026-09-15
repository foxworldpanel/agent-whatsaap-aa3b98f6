import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914350000_customer_turn_snapshot_source_presence.sql", "utf8");

describe("Customer Turn durable snapshot structural constraints", () => {
  it("rejects empty execution identity on new membership rows without invalidating legacy deployment", () => {
    expect(migration).toContain("agent_customer_turn_member_external_id_present");
    expect(migration).toContain("nullif(btrim(external_id),'') IS NOT NULL");
    expect(migration).toContain("agent_customer_turn_member_send_target_present");
    expect(migration).toContain("nullif(btrim(send_target),'') IS NOT NULL");
    expect(migration).toContain("agent_customer_turn_member_input_kind_valid");
    expect(migration).toContain("NOT VALID");
  });
});
