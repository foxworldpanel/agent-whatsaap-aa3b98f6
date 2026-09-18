import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260914540000_welcome_funnel_conversation_barrier_user_identity.sql",
  "utf8",
);

describe("Welcome Funnel conversation barrier", () => {
  it("uses the final full-routing-identity barrier contract", () => {
    expect(migration).toContain("p_conversation_id");
    expect(migration).toContain("p_user_id");
    expect(migration).toContain("p_workspace_id");
    expect(migration).toContain("needs_review");
    expect(migration).toContain("running");
    expect(migration).toContain("clear");
  });
});
