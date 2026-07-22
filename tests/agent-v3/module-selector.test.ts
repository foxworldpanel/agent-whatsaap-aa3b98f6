import { describe, expect, it } from "vitest";
import { selectModulesV3 } from "../../src/lib/agent-v3/selector/module-selector.server";
import type { LoadedModuleV3 } from "../../src/lib/agent-v3/brain/modules.server";

const module = (priority = 0, extra: Partial<LoadedModuleV3["routing"]> = {}): LoadedModuleV3 => ({
  content: "conteúdo válido",
  source: "database",
  version: 1,
  routing: {
    alwaysLoad: false,
    intents: [],
    stages: [],
    platforms: [],
    products: [],
    triggers: [],
    dependencies: [],
    conflicts: [],
    priority,
    ...extra,
  },
});

describe("Agent V3 module selector", () => {
  it("carrega Spotify pela chave mesmo sem metadados migrados", () => {
    const result = selectModulesV3("Spotify", [], {
      identidade: module(100),
      regras_gerais: module(90),
      spotify: module(10),
      instagram: module(10),
    });
    expect(result.context.platform).toBe("spotify");
    expect(result.selectedModules).toContain("spotify");
    expect(result.selectedModules).not.toContain("instagram");
  });

  it("não descarta dependência obrigatória após atingir o limite primário", () => {
    const modules: Record<string, LoadedModuleV3> = {
      identidade: module(100),
      regras_gerais: module(99),
      spotify: module(98, { dependencies: ["pagamentos"] }),
      pagamentos: module(0),
    };
    for (let i = 0; i < 12; i++) modules[`m${i}`] = module(90 - i, { alwaysLoad: true });
    const result = selectModulesV3("Spotify", [], modules);
    expect(result.selectedModules).toContain("spotify");
    expect(result.selectedModules).toContain("pagamentos");
  });
});
