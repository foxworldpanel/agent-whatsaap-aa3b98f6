import { describe, expect, it } from "vitest";
import { autoSplitLongPartsV3, LONG_MESSAGE_THRESHOLD } from "../src/lib/agent-v3/integrations/audio-processor.server";

describe("Agent V3 humanization stage 1", () => {
  it("keeps concise WhatsApp replies in one message", () => {
    const text = "Sim, temos esse serviço disponível. A compra é feita diretamente pelo painel da Mind.";
    expect(autoSplitLongPartsV3(text)).toEqual([text]);
  });

  it("splits replies above 250 characters into 2 or 3 natural messages", () => {
    const text = "O serviço está disponível e pode ser comprado diretamente pelo painel da Mind. Primeiro você faz o cadastro usando e-mail e senha. Depois recarrega o saldo via Pix e escolhe o serviço desejado. Quando o pedido for criado, o sistema começa o processamento conforme o prazo informado no painel.";
    const parts = autoSplitLongPartsV3(text);
    expect(LONG_MESSAGE_THRESHOLD).toBe(250);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(3);
    expect(parts.join(" ")).toContain("O serviço está disponível");
    expect(parts.every((part) => part.length > 0)).toBe(true);
  });

  it("preserves explicit panel-link isolation", () => {
    const parts = autoSplitLongPartsV3("Acesse o painel===SPLIT===https://mindsmmpanel.com===SPLIT===Depois faça o cadastro.");
    expect(parts).toEqual(["Acesse o painel", "https://mindsmmpanel.com", "Depois faça o cadastro."]);
  });
});
