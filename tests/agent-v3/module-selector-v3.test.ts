import { describe, expect, it } from "vitest";
import { detectConversationContext, selectModulesV3 } from "../../src/lib/agent-v3/module-selector.server";

const enabled = [
  "identidade", "regras_gerais", "comportamento_humano", "instagram", "youtube", "spotify",
  "fluxo_vendas", "psicologia_vendas", "tabela_precos", "fechamento_vendas",
  "objecoes_vendas", "prova_social", "seguranca", "pagamentos", "suporte", "suporte_pos_compra",
];

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
    const result = selectModulesV3("Quanto custa no Spotify?", [], enabled.filter(key => key !== "spotify"));
    expect(result.selectedModules).not.toContain("spotify");
  });
});
