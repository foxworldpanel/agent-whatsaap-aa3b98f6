import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync(
  "src/lib/welcome-funnel-orchestrator.server.ts",
  "utf8",
);
const runner = fs.readFileSync(
  "src/lib/welcome-funnel-runner.server.ts",
  "utf8",
);

describe("Welcome funnel repeat safety", () => {
  it("preserva completed como terminal e não reabre execução automaticamente", () => {
    expect(orchestrator).toContain('if(initial==="durable_completed")return{status:"already_completed"');
    expect(orchestrator).toContain('if(fenced==="durable_completed")return{status:"already_completed"');
    expect(runner).toContain("automatic resume requires a durable resume transition");
  });

  it("falha parcial vai para revisão durável em vez de reset/replay automático", () => {
    expect(runner).toContain('operation:"needs_review"');
    expect(runner).toContain("manual review required");
  });
});
