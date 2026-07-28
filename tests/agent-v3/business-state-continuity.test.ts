import { describe, expect, it } from "vitest";
import {
  deriveBusinessDecisionV3,
  enrichBusinessDecisionV3,
  reconcileBusinessDecisionV3,
} from "../../src/lib/agent-v3/brain/business-state.server";

function decision(message: string) {
  return enrichBusinessDecisionV3(deriveBusinessDecisionV3({ message }), message);
}

describe("Business State V3 continuity", () => {
  it("does not return to discovery after payment on a short answer", () => {
    const previous = decision("manda o pix");
    const current = decision("sim");
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message: "sim" });

    expect(reconciled.state).toBe("pagamento");
    expect(reconciled.allowQualification).toBe(false);
  });

  it("keeps closing while answering an operational question", () => {
    const previous = decision("quero 1000 plays");
    const current = decision("como funciona?");
    const reconciled = reconcileBusinessDecisionV3({ previous, current, message: "como funciona?" });

    expect(reconciled.state).toBe("fechamento");
    expect(reconciled.nextAction).toContain("continuar o fechamento");
  });

  it("allows an explicit new purchase to start a new commercial decision", () => {
    const previous = decision("já paguei");
    const current = decision("quero comprar 1000 seguidores");
    const reconciled = reconcileBusinessDecisionV3({
      previous,
      current,
      message: "quero comprar 1000 seguidores",
    });

    expect(reconciled.state).toBe(current.state);
    expect(reconciled.state).not.toBe("pedido_realizado");
  });

  it("never blocks a mandatory human handoff", () => {
    const previous = decision("manda o pix");
    const current = decision("quero falar com uma pessoa");
    const reconciled = reconcileBusinessDecisionV3({
      previous,
      current,
      message: "quero falar com uma pessoa",
    });

    expect(reconciled.shouldHandoff).toBe(true);
    expect(reconciled.state).toBe("aguardando_setor");
  });
});
