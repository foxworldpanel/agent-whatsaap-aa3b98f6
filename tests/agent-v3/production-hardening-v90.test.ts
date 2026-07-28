import { describe, expect, it } from "vitest";
import { autoSplitLongPartsV3 } from "../../src/lib/agent-v3/integrations/audio-processor.server";
import { reconcileBusinessDecisionV3, type BusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";

describe("Agent V3 production hardening v90.1", () => {
  it("limita a três mensagens sem descartar conteúdo", () => {
    const original = [
      "Primeira orientação curta.",
      "Segunda orientação curta.",
      "Terceira orientação curta.",
      "Quarta orientação que também precisa chegar ao cliente.",
    ].join("===SPLIT===");

    const parts = autoSplitLongPartsV3(original);
    expect(parts).toHaveLength(3);
    expect(parts.join(" ")).toContain("Primeira orientação curta");
    expect(parts.join(" ")).toContain("Quarta orientação que também precisa chegar ao cliente");
  });

  it("preserva handoff humano até liberação explícita do operador", () => {
    const previous: BusinessDecisionV3 = {
      state: "aguardando_setor",
      risk: "humano_obrigatorio",
      reason: "cliente solicitou outro atendente",
      nextAction: "encaminhar ao setor responsável",
      allowQualification: false,
      shouldHandoff: true,
    };

    const current: BusinessDecisionV3 = {
      state: "descoberta",
      risk: "normal",
      reason: "cliente explorando plataforma/necessidade",
      nextAction: "entender o objetivo",
      allowQualification: true,
      shouldHandoff: false,
    };

    const result = reconcileBusinessDecisionV3({ previous, current, message: "quero spotify" });
    expect(result.state).toBe("aguardando_setor");
    expect(result.shouldHandoff).toBe(true);
    expect(result.allowQualification).toBe(false);
  });
});
