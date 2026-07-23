import { describe, expect, it, vi } from "vitest";
import { selectModulesV3 } from "@/lib/agent-v3/selector/module-selector.server";
import type { LoadedModuleV3 } from "@/lib/agent-v3/brain/modules.server";

const module = (
  priority: number,
  options: Partial<LoadedModuleV3["routing"]> = {},
): LoadedModuleV3 => ({
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
    ...options,
  },
});

describe("module selector conflict integrity", () => {
  it("remove o dependente quando um conflito elimina sua dependência obrigatória", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const modules = {
      spotify: module(80, {
        platforms: ["spotify"],
        dependencies: ["tabela_precos"],
      }),
      tabela_precos: module(20, { conflicts: ["campanha_especial"] }),
      campanha_especial: module(90, { alwaysLoad: true }),
    };

    const result = selectModulesV3("Quero Spotify", [], modules);

    expect(result.selectedModules).toContain("campanha_especial");
    expect(result.selectedModules).not.toContain("tabela_precos");
    expect(result.selectedModules).not.toContain("spotify");
    warn.mockRestore();
  });

  it("mantém dependências transitivas quando não há conflito", () => {
    const modules = {
      spotify: module(80, {
        platforms: ["spotify"],
        dependencies: ["tabela_precos"],
      }),
      tabela_precos: module(50, { dependencies: ["pagamentos"] }),
      pagamentos: module(40),
    };

    const result = selectModulesV3("Spotify", [], modules);

    expect(result.selectedModules).toEqual(
      expect.arrayContaining(["spotify", "tabela_precos", "pagamentos"]),
    );
  });
});
