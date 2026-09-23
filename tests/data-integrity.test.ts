import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Agent V3 data integrity contract", () => {
  it("requires workspace-scoped CMS module loading", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/agent-v3/brain/modules.server.ts"), "utf8");
    expect(src).toContain('from("agent_modules_v3")');
    expect(src).toContain("workspace_id");
  });

  it("does not require live Supabase credentials for this static regression", () => {
    const orchestrator = readFileSync(join(process.cwd(), "src/lib/agent-v3/orchestrator.server.ts"), "utf8");
    expect(orchestrator).toContain("workspaceId");
    expect(orchestrator).toContain("loadEnabledModulesV3");
  });
});
