import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Customer Turn final stale-reply fence", () => {
  const root = process.cwd();
  const runtime = readFileSync(join(root, "src/lib/agent-v3/runtime.server.ts"), "utf8");
  const contract = readFileSync(join(root, "src/lib/agent-v3/inbound-runtime-contract.server.ts"), "utf8");
  const builder = readFileSync(join(root, "src/lib/agent-v3/customer-turn-runtime.server.ts"), "utf8");
  const result = readFileSync(join(root, "src/lib/agent-v3/inbound-runtime-result.server.ts"), "utf8");

  it("carries durable Customer Turn identity into dispatcher runtime", () => {
    expect(contract).toContain("customerTurnId?: string");
    expect(builder).toContain("customerTurnId:turnId");
  });

  it("checks pending inbound outside the current snapshot immediately before text send", () => {
    expect(runtime).toContain("hasNewerInboundOutsideCurrentTurn");
    expect(runtime).toContain('.from("agent_customer_turn_messages")');
    expect(runtime).toContain('.from("agent_inbound_jobs")');
    expect(runtime).toContain('.select("last_received_at")');
    expect(runtime).toContain('.gt("created_at", currentTurn.last_received_at)');
    expect(runtime).toContain('return runtimeTerminal("superseded_by_newer_inbound")');
    expect(runtime).toContain('stale text reply suppressed before provider send');
    expect(runtime.indexOf("hasNewerInboundOutsideCurrentTurn()", runtime.indexOf("for (let partIndex"))).toBeLessThan(
      runtime.indexOf("sendAgentTextGuarded(", runtime.indexOf("for (let partIndex")),
    );
  });

  it("checks again after audio humanization delay and before provider audio send", () => {
    const delay = runtime.indexOf("await sleepMs(remainingAudioDelayMs)");
    const fence = runtime.indexOf("hasNewerInboundOutsideCurrentTurn()", delay);
    const send = runtime.indexOf("await uazapiSendAudio(", delay);
    expect(delay).toBeGreaterThan(-1);
    expect(fence).toBeGreaterThan(delay);
    expect(send).toBeGreaterThan(fence);
  });

  it("treats superseded generation as an intentional no-reply terminal", () => {
    expect(result).toContain('"superseded_by_newer_inbound"');
    expect(result).toContain('superseded_by_newer_inbound: "completed_without_reply"');
  });
});
