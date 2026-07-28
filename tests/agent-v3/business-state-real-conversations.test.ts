import { describe, expect, it } from "vitest";
import { deriveBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";

describe("Business State V3 — casos reais de produção", () => {
  it("cliente pedindo humano sai do agente", () => {
    const d = deriveBusinessDecisionV3({
      message: "Posso falar com alguém por favor sem ser robô",
      recentCustomerMessages: [],
    });
    expect(d.shouldHandoff).toBe(true);
    expect(d.state).toBe("aguardando_setor");
    expect(d.risk).toBe("humano_obrigatorio");
  });

  it("venda bloqueada depois de várias tentativas vai ao setor", () => {
    const d = deriveBusinessDecisionV3({
      message: "Já fiz isso e ainda não aparece uma opção de pagamento",
      recentCustomerMessages: [
        "Não consigo criar a conta",
        "Tentei limpar cache e atualizar",
        "O Pix não aparece",
      ],
    });
    expect(d.state).toBe("compra_bloqueada");
    expect(d.shouldHandoff).toBe(true);
  });

  it("primeira dificuldade técnica não força handoff precoce", () => {
    const d = deriveBusinessDecisionV3({
      message: "Não aparece a opção de pagamento",
      recentCustomerMessages: ["Quero comprar 1000 seguidores"],
    });
    expect(d.state).toBe("compra_bloqueada");
    expect(d.shouldHandoff).toBe(false);
    expect(d.risk).toBe("alto");
  });

  it("pedido confirmado entra em pedido realizado", () => {
    const d = deriveBusinessDecisionV3({
      message: "Pronto, já fiz o pedido",
      recentCustomerMessages: ["Quero 1000 visualizações"],
    });
    expect(d.state).toBe("pedido_realizado");
    expect(d.allowQualification).toBe(false);
  });

  it("adiamento não deve continuar vendendo", () => {
    const d = deriveBusinessDecisionV3({
      message: "Estou trabalhando, depois das 17h podemos conversar",
      recentCustomerMessages: [],
    });
    expect(d.state).toBe("adiado");
    expect(d.allowQualification).toBe(false);
  });

  it("abandono durante pagamento recebe atenção", () => {
    const d = deriveBusinessDecisionV3({
      message: "Deixa pra lá, vou desistir",
      recentCustomerMessages: ["Onde pago?", "Não consegui fazer a recarga"],
    });
    expect(d.state).toBe("abandono");
    expect(["alto", "atencao"]).toContain(d.risk);
  });

  it("nova compra não herda bloqueio técnico antigo", () => {
    const d = deriveBusinessDecisionV3({
      message: "Agora consegui, quero comprar 1000 seguidores",
      recentCustomerMessages: [
        "Não consigo pagar",
        "O cadastro está dando erro",
      ],
    });
    expect(d.state).not.toBe("compra_bloqueada");
    expect(d.shouldHandoff).toBe(false);
  });

  it("pedido de preço vira orçamento", () => {
    const d = deriveBusinessDecisionV3({
      message: "Quanto custa 1000 plays?",
      recentCustomerMessages: ["Spotify"],
    });
    expect(d.state).toBe("orcamento");
  });
});
