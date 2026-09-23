import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_IDENTITY,
  MIND_BRAND_TEMPLATE,
  buildSharedRules,
} from "@/lib/agent-identity.server";

describe("Agent V3 CMS-owned commercial rules", () => {
  it("legacy identity no longer injects commercial prompt rules", () => {
    expect(DEFAULT_IDENTITY.persona).toBe("");
    expect(MIND_BRAND_TEMPLATE.persona).toBe("");
    expect(buildSharedRules(DEFAULT_IDENTITY)).toBe("");
  });

  it("runtime loads prompt modules from agent_modules_v3", () => {
    const modules = readFileSync(
      join(process.cwd(), "src/lib/agent-v3/brain/modules.server.ts"),
      "utf8",
    );
    expect(modules).toContain('from("agent_modules_v3")');
    expect(modules).toContain("workspace_id");
  });

  it("selector consumes LoadedModuleV3 routing instead of legacy identity constants", () => {
    const selector = readFileSync(
      join(process.cwd(), "src/lib/agent-v3/selector/module-selector.server.ts"),
      "utf8",
    );
    expect(selector).toContain("LoadedModuleV3");
    expect(selector).toContain("routing");
  });
});
