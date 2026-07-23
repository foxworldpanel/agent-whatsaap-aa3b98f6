import { describe, expect, it } from "vitest";
import { selectModulesV3 } from "../../../src/lib/agent-v3/selector/module-selector.server";
import type { LoadedModuleV3 } from "../../../src/lib/agent-v3/brain/modules.server";

const moduleOf = (
  platforms: string[] = [],
  triggers: string[] = [],
  priority = 0,
): LoadedModuleV3 => ({
  content: "conteudo",
  source: "cms",
  version: 1,
  routing: {
    alwaysLoad: false,
    intents: [],
    stages: [],
    platforms,
    products: [],
    triggers,
    dependencies: [],
    conflicts: [],
    priority,
  },
});

describe("Agent V3 platform routing regression", () => {
  it.each([
    ["spotify", "spotify"],
    ["youtube", "youtube"],
    ["instagram", "instagram"],
    ["tiktok", "tiktok"],
  ])("carrega apenas a plataforma pedida: %s", (message, expected) => {
    const modules: Record<string, LoadedModuleV3> = {
      identidade: moduleOf(),
      spotify: moduleOf(["spotify"]),
      youtube: moduleOf(["youtube"]),
      instagram: moduleOf(["instagram"]),
      tiktok: moduleOf(["tiktok"]),
    };

    const result = selectModulesV3(message, [], modules);

    expect(result.selectedModules).toContain(expected);
    for (const other of ["spotify", "youtube", "instagram", "tiktok"]) {
      if (other !== expected) expect(result.selectedModules).not.toContain(other);
    }
  });

  it("carrega módulo customizado quando o CMS roteia pela plataforma", () => {
    const modules: Record<string, LoadedModuleV3> = {
      identidade: moduleOf(),
      spotify: moduleOf(["spotify"]),
      spotify_precos: moduleOf(["spotify"], ["preco", "valor"], 10),
      youtube: moduleOf(["youtube"]),
    };

    const result = selectModulesV3("qual o preço do spotify?", [], modules);

    expect(result.selectedModules).toContain("spotify");
    expect(result.selectedModules).toContain("spotify_precos");
    expect(result.selectedModules).not.toContain("youtube");
  });
});
