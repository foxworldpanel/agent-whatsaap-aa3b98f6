import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { selectModulesV3 } from "../../src/lib/agent-v3/selector/module-selector.server";

const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

const baseRouting = {
  alwaysLoad: false,
  intents: [] as string[],
  stages: [] as string[],
  platforms: ["instagram"],
  products: ["seguidores"],
  triggers: [] as string[],
  dependencies: [] as string[],
  conflicts: [] as string[],
  priority: 90,
};

describe("Instagram follower options + panel link", () => {
  it("carrega todas as variantes comerciais de seguidores", () => {
    const modules: any = {
      identidade: {
        content: "Júlia",
        source: "cms",
        version: 1,
        routing: { ...baseRouting, alwaysLoad: true, platforms: [], products: [], priority: 100 },
      },
      instagram_seguidores_global: {
        content: "1000 Seguidores Global - R$ 7,00",
        source: "cms",
        version: 1,
        routing: baseRouting,
      },
      instagram_seguidores_brasil_promo: {
        content: "1000 Seguidores Brasil Promocional - R$ 15,00",
        source: "cms",
        version: 1,
        routing: baseRouting,
      },
      instagram_seguidores_brasil_premium: {
        content: "1000 Seguidores Brasil Premium - R$ 50,00",
        source: "cms",
        version: 1,
        routing: baseRouting,
      },
    };

    const result = selectModulesV3(
      "e 1000 seguidores para o insta",
      [],
      modules,
    );

    expect(result.selectedModules).toContain("instagram_seguidores_global");
    expect(result.selectedModules).toContain("instagram_seguidores_brasil_promo");
    expect(result.selectedModules).toContain("instagram_seguidores_brasil_premium");
  });

  it("prompt manda mostrar todas as variantes e não inventar diferença", () => {
    expect(orchestrator).toContain("apresente TODAS as opções relevantes");
    expect(orchestrator).toContain("não omita uma opção promocional");
    expect(orchestrator).toContain('Não invente "perfil mais qualificado"');
  });

  it("painel deve ser enviado como mensagem isolada", () => {
    expect(orchestrator).toContain("LINK DO PAINEL:");
    expect(orchestrator).toContain("https://mindsmmpanel.com");
    expect(orchestrator).toContain("URLs do painel devem chegar como mensagem isolada");
  });
});
