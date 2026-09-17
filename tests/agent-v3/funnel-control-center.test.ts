import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const control = readFileSync("src/lib/funnel-control.functions.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/funis.tsx", "utf8");
const menu = readFileSync("src/components/AppShell.tsx", "utf8");

describe("Central do Funil", () => {
  it("uses durable execution state as the operational authority", () => {
    expect(control).toContain('.from("welcome_funnel_execution_state")');
    expect(control).toContain("last_completed_step");
    expect(control).toContain('classification: `durable_${row.status}`');
    expect(control).not.toContain("conversations.funnel_status");
  });

  it("keeps historical compatibility distinct from proven completion", () => {
    expect(control).toContain('"legacy_compatible"');
    expect(control).toContain('"legacy_ambiguous"');
    expect(control).toContain('status: compatible ? "historical" : "failed"');
    expect(control).toContain("completion_proven: false");
    expect(page).toContain('"historical"');
    expect(page).toContain("Histórico (não comprovado)");
  });

  it("never rewrites legacy claims or replays uncertain sends", () => {
    expect(control).not.toContain('.from("welcome_funnel_runs")\n      .delete()');
    expect(control).not.toContain("runWelcomeFunnelSequence");
    expect(control).not.toContain("executeFromControlCenter");
    expect(control).toContain("unsupportedControlAction");
    expect(control).toContain(
      "Retry, resume e pause exigem uma transição manual auditada",
    );
  });

  it("reports durable review and ambiguous claims as alerts", () => {
    expect(control).toContain('row.status === "failed" || row.stale');
    expect(control).toContain('error_category: compatible ? null : "legacy_ambiguous"');
    expect(control).toContain('"needs_review"');
  });

  it("keeps the control page and navigation available for inspection", () => {
    expect(page).toContain("Central do Funil");
    expect(page).toContain("Linha do tempo");
    expect(menu).toContain('to: "/funis"');
    expect(menu).toContain("funnelAlertCount");
  });
});
