import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914313000_customer_turn_member_canonical_order.sql"),
  "utf8",
);

describe("Customer Turn canonical member ordering", () => {
  it("replays the durable attachment sequence", () => {
    expect(sql).toContain("ORDER BY tm.ordinal");
    expect(sql).not.toContain("ORDER BY m.created_at");
  });

  it("preserves the resolved-media cache in the effective loader", () => {
    expect(sql).toContain("tm.resolved_text");
    expect(sql).toContain("resolved_text text");
  });

  it("keeps the loader service-role only", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.load_agent_customer_turn_members(uuid) FROM PUBLIC,anon,authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.load_agent_customer_turn_members(uuid) TO service_role");
  });
});
