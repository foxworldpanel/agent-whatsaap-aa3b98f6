import { describe, expect, it } from "vitest";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";
import { repairClearlyIncompleteAgentReplyV3, splitMindPanelUrlPartsV3 } from "../../src/lib/agent-v3/core/commercial-response-guards.server";

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

  it("never sends a single clearly truncated construction", () => {
    const repaired = repairClearlyIncompleteAgentReplyV3("Você pode fazer o pedido pelo");
    expect(repaired).not.toContain("pedido pelo");
    expect(repaired).toMatch(/[?!.]$/);
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
    expect(decision.nextAction).toContain("não há CNPJ brasileiro");
  });

  it("requires vertical authoritative price formatting", () => {
    const decision = deriveBusinessDecisionV3({ message: "Quanto custa no Spotify?" });
    expect(decision.state).toBe("orcamento");
    expect(decision.nextAction).toContain("um serviço por linha");
    expect(decision.nextAction).toContain("sem tabela");
  });

});
