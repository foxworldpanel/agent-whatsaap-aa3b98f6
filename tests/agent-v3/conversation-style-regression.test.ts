import { describe, expect, it } from "vitest";
import { limitEmojiFrequency } from "../../src/lib/agent-v3/brain/guards.server";
import fs from "node:fs";

describe("Agent V3 conversation style", () => {
  it("mantém no máximo um emoji na resposta", () => {
    const result = limitEmojiFrequency(
      "Perfeito! 🎵 Temos esse serviço 😊 Qual quantidade você quer? 🚀",
      [],
    );
    const emojis = result.match(/[\u{1F300}-\u{1F9FF}]/gu) ?? [];
    expect(emojis).toHaveLength(1);
  });

  it("remove emoji se uma das últimas 3 mensagens do agente já usou", () => {
    const result = limitEmojiFrequency(
      "Claro 😊 Quantos você gostaria?",
      [
        { sender: "agente", body: "Boa noite! 😊" },
        { sender: "cliente", body: "tenho interesse" },
        { sender: "agente", body: "Qual rede você procura?" },
      ],
    );
    expect(result).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("mantém fluxo comercial progressivo no system prompt", () => {
    const source = fs.readFileSync(
      "src/lib/agent-v3/orchestrator.server.ts",
      "utf8",
    );
    expect(source).toContain("rede/plataforma → serviço → quantidade → valor → link/pedido/pagamento");
    expect(source).toContain("Não despeje tabela, preços ou catálogo");
    expect(source).toContain("Não peça o link antes de saber o serviço");
    expect(source).toContain("Faça no máximo UMA pergunta por mensagem");
  });
});
