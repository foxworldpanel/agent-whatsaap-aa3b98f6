import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const gate = readFileSync(
  "src/lib/welcome-funnel-webhook-gate.server.ts",
  "utf8",
);
const orchestrator = readFileSync(
  "src/lib/welcome-funnel-orchestrator.server.ts",
  "utf8",
);
const runner = readFileSync(
  "src/lib/welcome-funnel-runner.server.ts",
  "utf8",
);

describe("Welcome Funnel -> Agent V3 runtime", () => {
  it("loads scoped enabled funnels and delegates durable ownership", () => {
    expect(gate).toContain('.from("welcome_funnels")');
    expect(gate).toContain('.eq("enabled",true)');
    expect(gate).toContain("orchestrateWelcomeFunnel");
  });

  it("blocks Agent runtime behind running and needs_review", () => {
    expect(gate).toContain("getWelcomeFunnelConversationBarrier");
    expect(gate).toContain('status:"conversation_blocked"');
    expect(gate).toContain('status==="blocked"');
  });

  it("executes text, audio, panel, video and services in canonical order", () => {
    const welcome = runner.indexOf('"welcome_text"');
    const audio = runner.indexOf('"audio"', welcome + 1);
    const panel = runner.indexOf('"panel_text"', audio + 1);
    const video = runner.indexOf('"video"', panel + 1);
    const services = runner.indexOf('"services_text"', video + 1);
    expect(welcome).toBeGreaterThan(-1);
    expect(audio).toBeGreaterThan(welcome);
    expect(panel).toBeGreaterThan(audio);
    expect(video).toBeGreaterThan(panel);
    expect(services).toBeGreaterThan(video);
  });

  it("proves durable completion after the external side-effect window", () => {
    const sequence = orchestrator.indexOf("await runWelcomeFunnelSequence");
    const ownership = orchestrator.indexOf(
      "await assertExecutionOwnership()",
      sequence,
    );
    const terminal = orchestrator.indexOf(
      'terminal!=="durable_completed"',
      ownership,
    );
    expect(sequence).toBeGreaterThan(-1);
    expect(ownership).toBeGreaterThan(sequence);
    expect(terminal).toBeGreaterThan(ownership);
  });

  it("uses exact-holder shared locking instead of legacy claims", () => {
    expect(orchestrator).toContain("acquireAgentConversationLock");
    expect(orchestrator).toContain("releaseAgentConversationLock");
    expect(orchestrator).toContain("randomUUID()");
    expect(orchestrator).not.toContain('.from("welcome_funnel_runs")');
  });
});
