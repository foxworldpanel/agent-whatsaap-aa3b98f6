import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const orchestrator = readFileSync(join(root, "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
const dashboard = readFileSync(join(root, "src/lib/dashboard.functions.ts"), "utf8");
const playground = readFileSync(join(root, "src/lib/agent-v3/admin/playground.functions.ts"), "utf8");
const runtime = readFileSync(join(root, "src/lib/agent-v3/runtime.server.ts"), "utf8");
const sender = readFileSync(join(root, "src/lib/send-agent-guarded.server.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20261007203000_restore_welcome_funnel_run_events_observability.sql"), "utf8");

describe("Agent V3 production hardening 2026-10-07", () => {
  it("does not load durable order memory for synthetic Playground identity", () => {
    expect(orchestrator).toContain("const hasDurablePhone");
    expect(orchestrator).toContain('!phone!.startsWith("playground:")');
    expect(orchestrator).toContain("previousOrderContext ?? EMPTY_ORDER_CONTEXT");
    expect(orchestrator).toContain("if (hasDurablePhone && workspaceId && userId)");
  });

  it("uses canonical contact source_data instead of missing contacts.origem", () => {
    expect(dashboard).toContain('select("source_data, status")');
    expect(dashboard).not.toContain('select("origem, status")');
    expect(dashboard).toContain("sourceData.provider");
  });

  it("uses one reply-part finalizer for Playground and WhatsApp", () => {
    expect(sender).toContain("export function finalizeAgentReplyParts");
    expect(playground).toContain("finalizeAgentReplyParts(");
    expect(runtime).toContain("finalizeAgentReplyParts(");
  });

  it("keeps Welcome Funnel event observability schema in version control", () => {
    expect(migration).toContain("create table if not exists public.welcome_funnel_run_events");
    expect(migration).toContain("enable row level security");
  });
});
