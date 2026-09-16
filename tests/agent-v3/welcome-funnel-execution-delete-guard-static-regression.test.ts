import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914384500_welcome_funnel_execution_delete_guard.sql", "utf8");

describe("Welcome Funnel durable execution delete guard", () => {
  it("keeps replay and external-side-effect evidence append-only", () => {
    expect(migration).toContain("REVOKE DELETE ON TABLE public.welcome_funnel_execution_state FROM service_role");
    expect(migration).toContain("BEFORE DELETE ON public.welcome_funnel_execution_state");
    expect(migration).toContain("welcome funnel durable execution state cannot be deleted");
  });
});
