import { describe, expect, it } from "vitest";
import { detectConversationContext, selectModulesV3 } from "../../src/lib/agent-v3/module-selector.server";
import type { LoadedModuleV3, ModuleRoutingV3 } from "../../src/lib/agent-v3/modules.server";

const routing = (patch: Partial<ModuleRoutingV3> = {}): ModuleRoutingV3 => ({
  alwaysLoad: false,
  intents: [],
  stages: [],
  platforms: [],
  products: [],
  triggers: [],
  dependencies: [],
  conflicts: [],
  priority: 0,
  ...patch,
});
const module = (patch: Partial<ModuleRoutingV3> = {}): LoadedModuleV3 => ({
  content: "conteúdo",
  source: "database",
  version: 1,
  routing: routing(patch),
});

const modules = {
  identidade: module({ alwaysLoad: true, priority: 100 }),
  spotify: module({ platforms: ["spotify"], priority: 80 }),
  youtube: module({ platforms: ["youtube"], priority: 80 }),
  tabela_precos: module({ intents: ["consulta_preco"], priority: 75 }),
  pagamentos: module({ intents: ["pagamento", "pos_compra"], triggers: ["pix"] }),
  suporte: module({ intents: ["suporte", "pos_compra"] }),
  fechamento: module({ stages: ["fechamento"], dependencies: ["identidade"] }),
  seguranca: module({ intents: ["duvida_seguranca"] }),
};

describe("Module Selector V3 orientado pelo CMS", () => {
  it("carrega always_load sem constante de core", () => {
    expect(selectModulesV3("oi", [], modules).selectedModules).toContain("identidade");
  });
  it("seleciona plataforma pelo contexto", () => {
    expect(selectModulesV3("quero plays no spotify", [], modules).selectedModules).toContain("spotify");
  });
  it("recupera plataforma do histórico recente do cliente", () => {
    const result = selectModulesV3("quero 5000", [{ role: "customer", content: "plays no spotify" }], modules);
    expect(result.selectedModules).toContain("spotify");
  });
  it("ignora plataforma citada apenas pelo agente", () => {
    const result = selectModulesV3("quero 5000", [{ role: "agent", content: "Spotify ou YouTube?" }], modules);
    expect(result.selectedModules).not.toContain("spotify");
    expect(result.selectedModules).not.toContain("youtube");
  });
  it("distingue consulta de preço", () => {
    expect(selectModulesV3("quanto custa 1000 plays?", [], modules).selectedModules).toContain("tabela_precos");
  });
  it("distingue pagamento futuro de pagamento realizado", () => {
    expect(detectConversationContext("como faço o pix?", []).intent).toBe("pagamento");
    expect(detectConversationContext("já paguei e mandei o comprovante", []).intent).toBe("pos_compra");
  });
  it("carrega suporte em pós-compra", () => {
    expect(selectModulesV3("paguei mas o saldo não caiu", [], modules).selectedModules).toContain("suporte");
  });
  it("carrega objeção de segurança por intenção", () => {
    expect(selectModulesV3("isso é seguro ou pode cair?", [], modules).selectedModules).toContain("seguranca");
  });
  it("respeita conflitos pela prioridade", () => {
    const conflicting = {
      a: module({ alwaysLoad: true, conflicts: ["b"], priority: 10 }),
      b: module({ alwaysLoad: true, conflicts: ["a"], priority: 5 }),
    };
    expect(selectModulesV3("oi", [], conflicting).selectedModules).toEqual(["a"]);
  });
  it("resolve dependências cadastradas no CMS", () => {
    const result = selectModulesV3("quero comprar 1000 inscritos", [], modules);
    expect(result.selectedModules).toContain("fechamento");
    expect(result.selectedModules).toContain("identidade");
  });
});
