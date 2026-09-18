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
    const p1 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts", "utf8");
    const p2 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts", "utf8");
    expect(p1).toContain("CONTEXTO ANTES DE PERGUNTAR");
    expect(p1).toContain("NUNCA envie o catálogo completo");
    expect(p1).toContain("NUNCA pede o link da música/vídeo");
    expect(p2).toContain("terminando com só 1 pergunta simples");
  });
});
