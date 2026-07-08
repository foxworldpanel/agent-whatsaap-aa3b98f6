import { describe, it, expect } from "vitest";
import { stripEmojiRuleDuplicates } from "@/lib/ai.server";

describe("ETAPA 1 — dedup fonte única de emoji", () => {
  it("remove linhas que mencionam 'emoji' e preserva o resto", () => {
    const raw = [
      "Regras gerais absolutas:",
      "- Sempre pareça humano, jamais diga que é IA.",
      "- Máximo 1 emoji sutil por resposta.",
      "- Nunca invente preço.",
      "- Evite emojis em cadeia (👍😊👌).",
      "- Responda curto no WhatsApp.",
    ].join("\n");
    const out = stripEmojiRuleDuplicates("regras_gerais", raw);
    expect(out).not.toMatch(/emoji/i);
    expect(out).toContain("Sempre pareça humano");
    expect(out).toContain("Nunca invente preço");
    expect(out).toContain("Responda curto");
  });

  it("é no-op quando não há menção a emoji", () => {
    const raw = "Nunca prometa prazo.\nSempre consulte o catálogo.";
    expect(stripEmojiRuleDuplicates("regras_gerais", raw)).toBe(raw);
  });

  it("aceita conteúdo vazio", () => {
    expect(stripEmojiRuleDuplicates("qualquer", "")).toBe("");
  });
});