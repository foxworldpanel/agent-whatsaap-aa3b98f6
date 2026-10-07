import { describe, expect, it } from "vitest";
import { deriveBusinessDecisionV3, reconcileBusinessDecisionV3 } from "../src/lib/agent-v3/brain/business-state.server";
import { repairClearlyIncompleteAgentReplyV3 } from "../src/lib/agent-v3/core/commercial-response-guards.server";

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
});
