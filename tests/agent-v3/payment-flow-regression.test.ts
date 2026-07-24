import { describe, expect, it } from "vitest";
import { detectConversationContext } from "../../src/lib/agent-v3/selector/module-selector.server";
import fs from "node:fs";

describe("Agent V3 payment flow regression", () => {
  it.each([
    "manda o pix",
    "manda pix",
    "me passa o pix",
    "qual o pix",
    "quero pagar",
    "onde pago",
  ])("classifica %s como pagamento/fechamento", (message) => {
    const ctx = detectConversationContext(message, []);
    expect(ctx.intent).toBe("pagamento");
    expect(ctx.stage).toBe("fechamento");
    expect(ctx.hasPaymentSignal).toBe(true);
  });

  it("pagamento vence sinal genérico de compra", () => {
    const ctx = detectConversationContext("quero pagar agora", []);
    expect(ctx.intent).toBe("pagamento");
  });

  it("system prompt proíbe link como pré-requisito de pagamento", () => {
    const source = fs.readFileSync(
      "src/lib/agent-v3/orchestrator.server.ts",
      "utf8",
    );

    expect(source).toContain("REGRA GERAL DE PAGAMENTO E LINK");
    expect(source).toContain("NUNCA peça link de música, vídeo, perfil, postagem");
    expect(source).toContain("Pare de qualificar e conduza imediatamente");
    expect(source).toContain("quantidade mínima e o valor correspondente");
  });
});
