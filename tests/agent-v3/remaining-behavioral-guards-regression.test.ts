import { describe, expect, it } from "vitest";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";
import { repairClearlyIncompleteAgentReplyV3, splitMindPanelUrlPartsV3, stripUnsupportedQuantityLimitsV3, containsPostSaleRepurchaseRegressionV3, spotifyPostSaleSupportReplyV3 } from "../../src/lib/agent-v3/core/commercial-response-guards.server";
import { decideSharedPreExecution, institutionalReplyV3 } from "../../src/lib/agent-v3/core/pre-execution-decision.server";
import { normalizeAgentTextPresentation } from "../../src/lib/send-agent-guarded.server";
import { autoSplitLongPartsV3 } from "../../src/lib/agent-v3/integrations/audio-processor.server";

describe("Agent V3 remaining behavioral guards", () => {
  it("drops a clearly truncated tail when a complete sentence already exists", () => {
    expect(repairClearlyIncompleteAgentReplyV3("O pedido está em andamento. A entrega acontece de")).toBe(
      "O pedido está em andamento.",
    );
  });

  it("does not alter normal conversational replies without final punctuation", () => {
    expect(repairClearlyIncompleteAgentReplyV3("Perfeito, pode me mandar o link")).toBe(
      "Perfeito, pode me mandar o link",
    );
  });

  it.each([
    "https://mindsmmpanel.com",
    "Acesse https://mindsmmpanel.com",
    "Acesse o painel em https://mindsmmpanel.com.",
    "Confira www.exemplo.com",
    "Acesse https://exemplo.com.br/cadastro",
  ])("never treats a URL TLD as a dangling Portuguese word: %s", (input) => {
    expect(repairClearlyIncompleteAgentReplyV3(input)).toBe(input);
  });

  it("keeps the canonical MIND panel URL intact through the shared finalizer splitter", () => {
    expect(splitMindPanelUrlPartsV3(
      "Você entra no painel e faz a recarga via Pix. https://mindsmmpanel.com",
    )).toEqual([
      "Você entra no painel e faz a recarga via Pix.",
      "https://mindsmmpanel.com",
    ]);
  });

  it("salvages a single truncated construction instead of asking the customer to repeat", () => {
    expect(repairClearlyIncompleteAgentReplyV3("Você pode fazer o pedido pelo")).toBe(
      "Você pode fazer o pedido.",
    );
  });

  it.each([
    ["A entrega acontece durante", "A entrega acontece."],
    ["Você consegue acompanhar por meio", "Você consegue acompanhar."],
    ["O prazo depende de", "O prazo."],
    ["Para comprar você acessa o painel e faz o pedido por", "Para comprar você acessa o painel e faz o pedido."],
  ])("repairs truncation generically without creating a repeat loop: %s", (input, expected) => {
    const repaired = repairClearlyIncompleteAgentReplyV3(input);
    expect(repaired).toBe(expected);
    expect(repaired).not.toMatch(/mande sua última mensagem|pode me mandar sua última mensagem|resposta ficou incompleta/i);
  });

  it("escapes sticky post-sale when the customer explicitly starts a new purchase", () => {
    const previous = {
      state: "pos_venda" as const,
      risk: "normal" as const,
      reason: "pedido anterior em pós-venda",
      nextAction: "responder ao pedido anterior",
      allowQualification: false,
      shouldHandoff: false,
    };
    const message = "Agora quero comprar seguidores para Instagram também";
    const current = deriveBusinessDecisionV3({
      message,
      customerLifecycle: "cliente",
    });
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message });
    expect(reconciled.state).not.toBe("pos_venda");
    expect(reconciled.reason).toContain("nova compra explícita após pós-venda");
    expect(reconciled.waitingCustomer).toBe(false);
  });

  it("keeps actual order support in post-sale", () => {
    const previous = {
      state: "pos_venda" as const,
      risk: "normal" as const,
      reason: "pedido anterior em pós-venda",
      nextAction: "responder ao pedido anterior",
      allowQualification: false,
      shouldHandoff: false,
    };
    const message = "O pedido 1124998 ainda não entrou";
    const current = deriveBusinessDecisionV3({ message, customerLifecycle: "cliente" });
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message });
    expect(reconciled.state).toBe("pos_venda");
    expect(reconciled.allowQualification).toBe(false);
  });
  it("blocks additional semantically dangling reply endings", () => {
    expect(repairClearlyIncompleteAgentReplyV3("A entrega acontece durante")).toMatch(/[?!.]$/);
    expect(repairClearlyIncompleteAgentReplyV3("Você consegue acompanhar por meio")).toMatch(/[?!.]$/);
    expect(repairClearlyIncompleteAgentReplyV3("O prazo depende de")).toMatch(/[?!.]$/);
  });

  it("preserves complete conversational endings that do not need punctuation", () => {
    expect(repairClearlyIncompleteAgentReplyV3("Perfeito, pode acompanhar pelo painel")).toBe(
      "Perfeito, pode acompanhar pelo painel",
    );
    expect(repairClearlyIncompleteAgentReplyV3("Certo, esse pedido continua em andamento")).toBe(
      "Certo, esse pedido continua em andamento",
    );
  });

  it.each([
    "quero outro serviço",
    "agora quero Instagram",
    "quero fazer mais um",
    "também preciso de seguidores",
    "agora preciso de visualizações",
  ])("exits post-sale for a clear new commercial intent: %s", (message) => {
    const previous = {
      state: "pos_venda" as const,
      risk: "normal" as const,
      reason: "pedido anterior em pós-venda",
      nextAction: "responder ao pedido anterior",
      allowQualification: false,
      shouldHandoff: false,
    };
    const current = deriveBusinessDecisionV3({ message, customerLifecycle: "cliente" });
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message });
    expect(reconciled.state).not.toBe("pos_venda");
    expect(reconciled.reason).toContain("nova compra explícita após pós-venda");
  });

  it.each([
    "o pedido 1124998 ainda não entrou",
    "e meu pedido?",
    "continua in progress?",
    "qual o status do pedido 1124998?",
    "ainda não chegaram as visualizações do pedido 1124998",
  ])("does not mistake continuing order support for a new purchase: %s", (message) => {
    const previous = {
      state: "pos_venda" as const,
      risk: "normal" as const,
      reason: "pedido anterior em pós-venda",
      nextAction: "responder ao pedido anterior",
      allowQualification: false,
      shouldHandoff: false,
    };
    const current = deriveBusinessDecisionV3({ message, customerLifecycle: "cliente" });
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message });
    expect(reconciled.state).toBe("pos_venda");
  });


  it("does not mistake complete closing questions for truncation", () => {
    expect(repairClearlyIncompleteAgentReplyV3("Como você quer seguir?")).toBe("Como você quer seguir?");
    expect(repairClearlyIncompleteAgentReplyV3("Qual você prefere?")).toBe("Qual você prefere?");
    expect(repairClearlyIncompleteAgentReplyV3("Quando quiser, pode chamar")).toBe("Quando quiser, pode chamar");
  });

  it("isolates the MIND panel URL from explanatory text", () => {
    expect(splitMindPanelUrlPartsV3("Segue o painel https://mindsmmpanel.com para fazer o pedido")).toEqual([
      "Segue o painel para fazer o pedido",
      "https://mindsmmpanel.com",
    ]);
  });

  it("preserves vertical formatting when isolating the panel URL", () => {
    expect(splitMindPanelUrlPartsV3("1.000 Plays + Ouvintes - R$ 15,00\n\nhttps://mindsmmpanel.com")).toEqual([
      "1.000 Plays + Ouvintes - R$ 15,00",
      "https://mindsmmpanel.com",
    ]);
  });

  it("keeps scheduled unreleased music in discovery without human handoff", () => {
    const decision = deriveBusinessDecisionV3({
      message: "Minha música vai ser lançada dia 14. Tenho que esperar ela ser lançada?",
    });
    expect(decision.state).toBe("descoberta");
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toContain("ainda nao publicado");
  });

  it("answers CNPJ questions as an institutional fact, not a handoff", () => {
    const decision = deriveBusinessDecisionV3({ message: "Qual seu CNPJ?" });
    expect(decision.state).toBe("descoberta");
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.nextAction).toContain("não possui sede no Brasil");
    expect(decision.nextAction).toContain("sem pedir para o cliente repetir");
    expect(decision.nextAction).toContain("não inventar número");
    expect(decision.nextAction).toContain("não afirmar que a empresa não possui CNPJ brasileiro");
  });

  it.each(["a empresa de voces tem CNPJ?", "Manda o CNPJ", "qual é o CNPJ da empresa?"])(
    "handles direct CNPJ wording without falling back or inventing legal data: %s",
    (message) => {
      const decision = deriveBusinessDecisionV3({ message });
      expect(decision.reason).toBe("cliente pediu informação institucional da MIND");
      expect(decision.shouldHandoff).toBe(false);
      expect(decision.allowQualification).toBe(false);
      expect(decision.nextAction).toContain("sem pedir para o cliente repetir");
      expect(decision.nextAction).not.toContain("não há CNPJ brasileiro para informar");
    },
  );

  it.each(["a empresa tem CNPJ?", "Manda o CNPJ", "qual o CNPJ da empresa?"])(
    "answers CNPJ deterministically before Claude/fallback: %s",
    (message) => {
      const reply = institutionalReplyV3(message);
      expect(reply).toContain("não possui sede no Brasil");
      expect(reply).toContain("Não tenho um CNPJ confirmado aqui");
      expect(reply).not.toMatch(/pode me confirmar|confirme esse ponto|mande sua última mensagem|não há CNPJ brasileiro/i);

      const decision = decideSharedPreExecution({
        message,
        inputKind: "texto",
        history: [],
        businessState: "descoberta",
      });
      expect(decision.kind).toBe("institutional");
    },
  );

  it.each(["de onde é a empresa?", "qual país é a MIND?", "a empresa é de qual pais?"])(
    "does not invent a country for institutional questions: %s",
    (message) => {
      const reply = institutionalReplyV3(message);
      expect(reply).toContain("operação da MIND é internacional e online");
      expect(reply).toContain("Não tenho um país de sede confirmado");
    },
  );

  it.each([
    [
      "1.000 Plays + Ouvintes sai por R$ 15,00. Quer confirmar essa quantidade?",
      "1.000 Plays + Ouvintes sai por R$ 15,00\n\nQuer confirmar essa quantidade?",
    ],
    [
      "No Spotify, a gente oferece Plays + Ouvintes. 1.000 Plays + Ouvintes = R$ 15,00 Qual quantidade você tá pensando?",
      "No Spotify, a gente oferece Plays + Ouvintes.\n\n1.000 Plays + Ouvintes = R$ 15,00\n\nQual quantidade você tá pensando?",
    ],
    [
      "Plays no Spotify. A gente tem o pacote Plays + Ouvintes: 1.000 = R$ 15,00 Quantos você tá pensando em comprar?",
      "Plays no Spotify. A gente tem o pacote Plays + Ouvintes:\n\n1.000 = R$ 15,00\n\nQuantos você tá pensando em comprar?",
    ],
    [
      "Temos Seguidores Brasil: 1.000 Seguidores = R$ 30,00 Quer essa quantidade?",
      "Temos Seguidores Brasil:\n\n1.000 Seguidores = R$ 30,00\n\nQuer essa quantidade?",
    ],
  ])("keeps commercial prices out of prose: %s", (input, expected) => {
    expect(normalizeAgentTextPresentation(input)).toBe(expected);
  });

  it("isolates a price sentence even when the quantity comes after the price", () => {
    expect(normalizeAgentTextPresentation(
      "Plays no Spotify saem a R$ 15,00 por 1.000. Quantos você quer comprar?",
    )).toBe(
      "Plays no Spotify saem a R$ 15,00 por 1.000\n\nQuantos você quer comprar?",
    );
  });

  it("never splits a numbered purchase list at the numeric marker", () => {
    const input =
      "Você compra pelo nosso painel. É bem simples: 1. Entra no painel e cria uma conta 2. Faz uma recarga via PIX 3. Escolhe o serviço 4. Pronto, começa o processo";
    const parts = autoSplitLongPartsV3(input, 80);
    expect(parts.join(" ")).toContain("É bem simples: 1. Entra");
    expect(parts).not.toContain("Você compra pelo nosso painel. É bem simples: 1.");
    expect(parts.join(" ")).toContain("2. Faz uma recarga");
    expect(parts.join(" ")).toContain("4. Pronto");
  });

  it("removes hallucinated minimum and maximum quantity limits without changing the valid offer", () => {
    expect(stripUnsupportedQuantityLimitsV3(
      "*Spotify:*\n1.000 Plays + Ouvintes, R$ 15,00\n(mínimo 500, máximo 500.000)",
      "Plays + Ouvintes: 1000 = R$ 15,00",
    )).toBe("*Spotify:*\n1.000 Plays + Ouvintes, R$ 15,00");
  });

  it("preserves quantity limits when the selected commercial authority explicitly contains them", () => {
    expect(stripUnsupportedQuantityLimitsV3(
      "1.000 Seguidores = R$ 30,00 (mínimo 100, máximo 10.000)",
      "Seguidores Brasil: 1000 = R$ 30,00 | mínimo 100 | máximo 10.000",
    )).toBe("1.000 Seguidores = R$ 30,00 (mínimo 100, máximo 10.000)");
  });

  it("blocks a paid Spotify customer from being sent back to checkout", () => {
    expect(containsPostSaleRepurchaseRegressionV3(
      "Perfeito! Já criei seu pedido de 1.000 Plays + Ouvintes. Agora é só entrar no painel, fazer a recarga via Pix e confirmar.",
    )).toBe(true);
  });

  it("gives the confirmed Spotify metric explanation and support route", () => {
    const reply = spotifyPostSaleSupportReplyV3();
    expect(reply).toMatch(/quantidade contratada é garantida nos plays/i);
    expect(reply).toMatch(/ouvintes.+não precisam chegar na mesma quantidade/is);
    expect(reply).toMatch(/janela de 28 dias/i);
    expect(reply).toMatch(/< 1\.000/i);
    expect(reply).toMatch(/Painel > Suporte/i);
    expect(reply).toMatch(/ID do pedido/i);
    expect(reply).toMatch(/24 horas/i);
    expect(reply).not.toMatch(/recarga|pagar novamente|já criei seu pedido/i);
  });

  it("requires vertical authoritative price formatting", () => {
    const decision = deriveBusinessDecisionV3({ message: "Quanto custa no Spotify?" });
    expect(decision.state).toBe("orcamento");
    expect(decision.nextAction).toContain("um serviço por linha");
    expect(decision.nextAction).toContain("sem tabela");
  });

});
