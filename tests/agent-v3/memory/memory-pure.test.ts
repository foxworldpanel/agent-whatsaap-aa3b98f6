import { describe, expect, it } from "vitest";
import { normalizePhoneV3 } from "@/lib/agent-v3/memory/conversation-state.server";
import { extractMetadataV3 } from "@/lib/agent-v3/memory/metadata-extractor.server";

describe("Agent V3 memory helpers", () => {
  it("canonicalizes Brazilian phone variants", () => {
    expect(normalizePhoneV3("(11) 97011-6430")).toBe("5511970116430");
    expect(normalizePhoneV3("+55 11 97011-6430")).toBe("5511970116430");
    expect(normalizePhoneV3("0055 11 97011-6430")).toBe("5511970116430");
  });

  it("preserves non-Brazilian international numbers", () => {
    expect(normalizePhoneV3("+1 (415) 555-2671")).toBe("14155552671");
  });

  it("rejects an empty phone", () => {
    expect(() => normalizePhoneV3("---")).toThrow("Telefone inválido");
  });

  it("validates metadata enums and clamps numeric scores", () => {
    const result = extractMetadataV3(
      "Olá! [TEMP:FERVENDO] [CONF:alta] [INTENT:Compra] [STAGE:Fechamento] " +
      "[PROB:999] [SENT:positivo] [URG:baixa] [SCORE:-20] [FEEDBACK:Bom| Claro ]",
    );

    expect(result.text).toBe("Olá!");
    expect(result.temperature).toBe("morno");
    expect(result.confidence).toBe("Alta");
    expect(result.intent).toBe("Compra");
    expect(result.stage).toBe("Fechamento");
    expect(result.purchase_probability).toBe(100);
    expect(result.sentiment).toBe("Positivo");
    expect(result.urgency).toBe("Baixa");
    expect(result.conversation_score).toBe(0);
    expect(result.conversation_feedback).toEqual(["Bom", "Claro"]);
  });
});
