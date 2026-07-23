import { describe, expect, it } from "vitest";
import { extractAnthropicTextV3 } from "../../../src/lib/agent-v3/integrations/llm-client.server";

describe("Agent V3 Anthropic response integrity", () => {
  it("concatena todos os blocos de texto na ordem retornada", () => {
    const text = extractAnthropicTextV3({
      content: [
        { type: "text", text: "[TEMP:morno]" },
        { type: "tool_use" },
        { type: "text", text: "Olá! Como posso ajudar?" },
      ],
    });

    expect(text).toBe("[TEMP:morno]\n\nOlá! Como posso ajudar?");
  });

  it("ignora blocos vazios e não textuais", () => {
    const text = extractAnthropicTextV3({
      content: [
        { type: "text", text: "   " },
        { type: "image" },
        { type: "text", text: "Resposta válida" },
      ],
    });

    expect(text).toBe("Resposta válida");
  });

  it("retorna vazio quando não existe texto utilizável", () => {
    expect(extractAnthropicTextV3({ content: [{ type: "tool_use" }] })).toBe("");
  });
});
