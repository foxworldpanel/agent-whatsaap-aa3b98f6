import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("knowledge base workspace isolation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/knowledge-base.functions.ts"), "utf8");

  it("scopes reads, limits and deletes by workspace", () => {
    const workspaceFilters = source.match(/\.eq\("workspace_id",\s*(?:context\.workspaceId|workspaceId)\)/g) ?? [];
    expect(workspaceFilters.length).toBeGreaterThanOrEqual(3);
  });

  it("persists workspace_id on new text and image examples", () => {
    const inserts = source.match(/workspace_id:\s*context\.workspaceId/g) ?? [];
    expect(inserts).toHaveLength(2);
  });
});
