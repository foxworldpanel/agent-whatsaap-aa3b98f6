import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Legacy Agent V2 retirement", () => {
  const webhook = readFileSync(join(process.cwd(), "src/routes/api/public/hooks/uazapi-webhook.ts"), "utf8");
  const executor = readFileSync(join(process.cwd(), "src/lib/agent-v3/core/execute-agent.server.ts"), "utf8");

  it("public webhook no longer imports or executes Agent V2", () => {
    expect(webhook).not.toMatch(/agent-v2|AgentBrainV2|resolveAgentBrainVersion/);
  });

  it("active execution is owned by the shared Agent V3 core", () => {
    expect(executor).toContain("runAgentV3Turn");
    expect(executor).toContain("resolvePreExecutionDecision");
  });
});
