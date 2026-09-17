import { describe, expect, it } from "vitest";
import fs from "node:fs";

const admin = fs.readFileSync("src/lib/agent-v3/admin/admin.functions.ts", "utf8");
const modules = fs.readFileSync("src/lib/agent-v3/brain/modules.server.ts", "utf8");

describe("CMS module authority", () => {
  it("lists modules from the current workspace instead of bootstrapping legacy defaults", () => {
    expect(admin).toContain('.from("agent_modules_v3")');
    expect(admin).toContain('.eq("workspace_id", workspaceId)');
    expect(admin).not.toContain("ensurePlatformSubmodulesV3");
  });

  it("loads enabled runtime modules exclusively from the CMS", () => {
    expect(modules).toContain('.eq("workspace_id", normalizedWorkspaceId)');
    expect(modules).toContain('.eq("enabled", true)');
    expect(modules).toContain("Nenhum módulo habilitado e preenchido no CMS");
  });

  it("prevents monolithic legacy platform modules from competing with modular families", () => {
    expect(modules).toContain('key.startsWith("spotify_")');
    expect(modules).toContain("delete modules.spotify");
    expect(modules).toContain('key.startsWith("youtube_")');
    expect(modules).toContain("delete modules.youtube");
  });

  it("keeps module updates idempotent by workspace and key", () => {
    expect(admin).toContain('{ onConflict: "workspace_id,key" }');
    expect(admin).toContain("invalidateModulesCache(workspaceId)");
  });
});
