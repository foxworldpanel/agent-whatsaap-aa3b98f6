import { describe, expect, it } from "vitest";
import { detectConversationContext, selectModulesV3 } from "@/lib/agent-v3/selector/module-selector.server";
import type { LoadedModuleV3, ModuleRoutingV3 } from "@/lib/agent-v3/brain/modules.server";

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
  content: "Conteúdo de teste",
  source: "database",
  version: 1,
  routing: routing(patch),
});

const enabled: Record<string, LoadedModuleV3> = {
  identidade: module({ alwaysLoad: true, priority: 100 }),
  regras_gerais: module({ alwaysLoad: true, priority: 99 }),
  comportamento_humano: module({ alwaysLoad: true, priority: 98 }),
  instagram: module({ platforms: ["instagram"] }),
  youtube: module({ platforms: ["youtube"] }),
  spotify: module({ platforms: ["spotify"] }),
  fluxo_vendas: module({ intents: ["consulta_preco", "compra"] }),
  psicologia_vendas: module({ stages: ["negociacao"] }),
  tabela_precos: module({ intents: ["consulta_preco"] }),
  fechamento_vendas: module({ stages: ["fechamento"] }),
  objecoes_vendas: module({ intents: ["objecao"] }),
  prova_social: module({ intents: ["duvida_seguranca"] }),
  seguranca: module({ intents: ["duvida_seguranca"] }),
  pagamentos: module({ intents: ["pagamento"] }),
  suporte: module({ intents: ["suporte"] }),
  suporte_pos_compra: module({ intents: ["pos_compra"] }),
};

describe("Module Selector V3 contextual", () => {
  it("normaliza acentos e detecta preço de visualizações no YouTube", () => {
    const result = selectModulesV3("Oi, quanto custa 1000 visualizações no YouTube?", [], enabled);
    expect(result.context.intent).toBe("consulta_preco");
    expect(result.context.platform).toBe("youtube");
    expect(result.context.product).toBe("visualizacoes");
    expect(result.selectedModules).toEqual(expect.arrayContaining(["youtube", "tabela_precos", "fluxo_vendas"]));
  });

  it("prioriza contexto recente do cliente e ignora plataformas citadas pelo agente", () => {
    const context = detectConversationContext("quanto fica 1000?", [
      { role: "agent", content: "Temos Instagram, YouTube e Spotify." },
      { role: "customer", content: "Quero inscritos no YouTube" },
    ]);
    expect(context.platform).toBe("youtube");
    expect(context.product).toBe("inscritos");
  });

  it("distingue dúvida de pagamento de pós-compra", () => {
    expect(detectConversationContext("Como pagar no Pix?", []).intent).toBe("pagamento");
    expect(detectConversationContext("Já paguei e o saldo não caiu", []).intent).toBe("pos_compra");
  });

  it("não reativa módulo explicitamente ausente da lista habilitada", () => {
    const { spotify: _removed, ...withoutSpotify } = enabled;
    const result = selectModulesV3("Quanto custa no Spotify?", [], withoutSpotify);
    expect(result.selectedModules).not.toContain("spotify");
  });
  it("não confunde intenção de compra com suporte só por conter a palavra pedido", () => {
    const context = detectConversationContext("quero fazer um pedido de 1000 seguidores", []);
    expect(context.intent).toBe("compra");
    expect(context.hasSupportSignal).toBe(false);
  });

  it("continua reconhecendo suporte quando pedido aparece em contexto de pós-venda", () => {
    expect(detectConversationContext("meu pedido está pendente", []).intent).toBe("suporte");
    expect(detectConversationContext("qual o status do pedido?", []).intent).toBe("suporte");
  });

  it("não trata pergunta de prazo como consulta de preço só pela palavra quanto", () => {
    expect(detectConversationContext("quanto tempo demora para entregar?", []).intent).not.toBe("consulta_preco");
    expect(detectConversationContext("quanto custa 1000 plays?", []).intent).toBe("consulta_preco");
  });

  it("não detecta plataforma por substring dentro de outra palavra", () => {
    expect(detectConversationContext("essa interface está dando erro", []).platform).toBeNull();
  });

});
