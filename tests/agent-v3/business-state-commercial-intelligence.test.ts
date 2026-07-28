import { describe, expect, it } from "vitest";
import {
  deriveBusinessDecisionV3,
  enrichBusinessDecisionV3,
  businessDecisionToPromptV3,
} from "../../src/lib/agent-v3/brain/business-state.server";

describe("Business State V3 commercial intelligence", () => {
  it("keeps payment as a high purchase-score closing objective", () => {
    const decision = enrichBusinessDecisionV3(
      deriveBusinessDecisionV3({ message: "manda o pix" }),
      "manda o pix",
    );

    expect(decision.state).toBe("pagamento");
    expect(decision.purchaseScore).toBe(95);
    expect(decision.urgencyScore).toBe(95);
    expect(decision.objective).toContain("concluir a compra");
    expect(decision.allowQualification).toBe(false);
  });

  it("marks deferred conversations as waiting for the customer", () => {
    const decision = enrichBusinessDecisionV3(
      deriveBusinessDecisionV3({ message: "mais tarde eu volto" }),
      "mais tarde eu volto",
    );

    expect(decision.state).toBe("adiado");
    expect(decision.waitingCustomer).toBe(true);
    expect(businessDecisionToPromptV3(decision)).toContain("Aguarde a próxima mensagem");
  });

  it("never lets a sales objective override mandatory human handoff", () => {
    const decision = enrichBusinessDecisionV3(
      deriveBusinessDecisionV3({ message: "quero falar com uma pessoa" }),
      "quero falar com uma pessoa",
    );

    expect(decision.shouldHandoff).toBe(true);
    expect(decision.risk).toBe("humano_obrigatorio");
    expect(decision.objective).toContain("atendimento humano");
  });
});
