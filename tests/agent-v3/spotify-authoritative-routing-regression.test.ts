import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectConversationContext, selectModulesV3 } from "../../src/lib/agent-v3/selector/module-selector.server";

const routing = (overrides: any = {}) => ({
  alwaysLoad: false, intents: [], stages: [], platforms: [], products: [], triggers: [],
  dependencies: [], conflicts: [], priority: 0, ...overrides,
});
const mod = (content: string, overrides: any = {}) => ({
  content, source: "database" as const, version: 1, routing: routing(overrides),
});
const modules = {
  identidade: mod("id", { alwaysLoad: true, priority: 100 }),
  regras_gerais: mod("rules", { alwaysLoad: true, priority: 100 }),
  tabela_precos: mod("consulte a específica", { intents: ["consulta_preco"], priority: 75 }),
  spotify: mod("LEGADO PREÇO ERRADO", { platforms: ["spotify"], priority: 80 }),
  spotify_servicos: mod("serviços", { platforms: ["spotify"], priority: 82 }),
  spotify_precos: mod("1000 = R$ 15; 500 = R$ 7,50", {
    platforms: ["spotify"], intents: ["consulta_preco", "compra"],
    stages: ["negociacao", "fechamento"], products: ["plays","ouvintes","saves","seguidores","playlist"], priority: 95,
  }),
  spotify_royalties: mod("não garantir ganhos", {
    platforms: ["spotify"], triggers: ["ganhar dinheiro","quanto vou ganhar","como vou receber"], priority: 89,
  }),
};

describe("Spotify authoritative routing", () => {
  it("herda Spotify + plays da última pergunta do agente quando cliente responde Sim", () => {
    const history = [
      { role: "customer" as const, content: "Eu trabalho com música" },
      { role: "agent" as const, content: "Então Spotify é o ideal. A Mind oferece plays. Quer saber os valores e como funciona?" },
    ];
    const ctx = detectConversationContext("Sim", history);
    expect(ctx.platform).toBe("spotify");
    expect(ctx.product).toBe("plays");
    expect(ctx.intent).toBe("consulta_preco");
    const selected = selectModulesV3("Sim", history, modules as any).selectedModules;
    expect(selected).toContain("spotify_precos");
    expect(selected).not.toContain("tabela_precos");
    expect(selected).not.toContain("spotify");
  });

  it("não usa palavra genérica plays para inferir Spotify", () => {
    const ctx = detectConversationContext("quero plays", []);
    expect(ctx.platform).toBeNull();
    expect(ctx.product).toBe("plays");
  });

  it("reconhece saves como produto Spotify", () => {
    const ctx = detectConversationContext("quanto custa saves no Spotify?", []);
    expect(ctx.platform).toBe("spotify");
    expect(ctx.product).toBe("saves");
  });
});

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
it("tem guard que impede preço Spotify sem autoridade", () => {
  expect(orchestrator).toContain("Bloqueado preço Spotify sem módulo autoritativo");
  expect(orchestrator).toContain("Nunca transforme R$ 15 por 1.000");
});

it("valida preço gerado contra conteúdo vivo do spotify_precos", () => {
  expect(orchestrator).toContain("hasUnsupportedSpotifyPriceClaim");
  expect(orchestrator).toContain("Preço Spotify divergente do módulo foi substituído");
});
