import { describe, expect, it } from "vitest";
import { selectModulesV3 } from "../../../src/lib/agent-v3/selector/module-selector.server";

const routing = (overrides: any = {}) => ({
  alwaysLoad: false,
  intents: [],
  stages: [],
  platforms: [],
  products: [],
  triggers: [],
  dependencies: [],
  conflicts: [],
  priority: 0,
  ...overrides,
});

const mod = (content: string, overrides: any = {}) => ({
  content,
  source: "database" as const,
  version: 1,
  routing: routing(overrides),
});

const modules = {
  identidade: mod("id", { alwaysLoad: true, priority: 100 }),
  regras_gerais: mod("rules", { alwaysLoad: true, priority: 100 }),
  spotify_servicos: mod("spotify geral", {
    platforms: ["spotify"],
    priority: 82,
  }),
  spotify_precos: mod("precos", {
    platforms: ["spotify"],
    intents: ["consulta_preco", "compra"],
    products: ["plays", "ouvintes", "seguidores", "playlist"],
    triggers: ["preço", "preco", "valor", "quanto custa", "quanto fica"],
    priority: 95,
  }),
  spotify_prazos: mod("prazos", {
    platforms: ["spotify"],
    triggers: ["prazo", "demora", "quanto tempo", "72 horas"],
    priority: 90,
  }),
  spotify_royalties: mod("royalties", {
    platforms: ["spotify"],
    triggers: ["royalties", "distribuidora"],
    priority: 89,
  }),
};

describe("roteamento fino de submódulos por plataforma", () => {
  it("carrega módulo geral quando cliente só informa Spotify", () => {
    const r = selectModulesV3("spotify", [], modules as any);
    expect(r.selectedModules).toContain("spotify_servicos");
    expect(r.selectedModules).not.toContain("spotify_precos");
    expect(r.selectedModules).not.toContain("spotify_prazos");
    expect(r.selectedModules).not.toContain("spotify_royalties");
  });

  it("carrega preços sem carregar prazos e royalties", () => {
    const history = [{ role: "customer", content: "spotify" }] as any;
    const r = selectModulesV3("quanto custa 1000 plays?", history, modules as any);
    expect(r.selectedModules).toContain("spotify_precos");
    expect(r.selectedModules).not.toContain("spotify_prazos");
    expect(r.selectedModules).not.toContain("spotify_royalties");
  });

  it("carrega royalties somente quando o assunto exigir", () => {
    const history = [{ role: "customer", content: "spotify" }] as any;
    const r = selectModulesV3("esses plays pagam royalties?", history, modules as any);
    expect(r.selectedModules).toContain("spotify_royalties");
    expect(r.selectedModules).not.toContain("spotify_prazos");
  });
});
