import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Agent V3 VPS migration regressions", () => {
  it("keeps the VPS node-server build reproducible from GitHub", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const config = fs.readFileSync("vite.vps.config.ts", "utf8");
    expect(pkg.scripts["build:vps"]).toBe("vite build --config vite.vps.config.ts");
    expect(config).toContain('preset: "node-server"');
    expect(config).toContain('dir: ".output-node"');
  });

  it("does not treat an established durable conversation as a first turn after recovery", () => {
    const source = fs.readFileSync("src/lib/agent-v3/core/execute-agent.server.ts", "utf8");
    expect(source).toContain("input.historyTelemetry?.total_messages_stored");
    expect(source).toContain("effectiveRouterContext");
    expect(source).toContain("durableStoredMessages <= 1");
    expect(source).toContain("routeMessage(input.message, effectiveRouterContext)");
  });

  it("reads Welcome Funnel completion only from durable execution state", () => {
    const source = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
    expect(source).toContain('.from("welcome_funnel_execution_state")');
    expect(source).toContain('.eq("status", "completed")');
    expect(source).not.toContain('.from("welcome_funnel_runs")\n            .select("funnel_id,status")');
  });
});
