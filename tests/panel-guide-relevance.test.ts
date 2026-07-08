import { describe, it, expect } from "vitest";
import { isPanelGuideRelevant } from "@/lib/panel-guide-relevance";

describe("ETAPA 3 — Panel Guide sob demanda", () => {
  it("venda pura (sem menção a painel) → não injeta", () => {
    expect(isPanelGuideRelevant("quanto custa 1000 plays no spotify?", [])).toBe(false);
    expect(isPanelGuideRelevant("quero seguidores no instagram", [])).toBe(false);
    expect(isPanelGuideRelevant("boa tarde, tudo bem?", [])).toBe(false);
  });

  it("pergunta operacional direta → injeta", () => {
    expect(isPanelGuideRelevant("como faço login?", [])).toBe(true);
    expect(isPanelGuideRelevant("não encontro o botão de depositar", [])).toBe(true);
    expect(isPanelGuideRelevant("onde clico pra adicionar saldo?", [])).toBe(true);
    expect(isPanelGuideRelevant("como cadastro no painel?", [])).toBe(true);
    expect(isPanelGuideRelevant("como faço o pix?", [])).toBe(true);
  });

  it("msg atual genérica mas contexto recente é operacional → injeta", () => {
    expect(
      isPanelGuideRelevant("não entendi", ["como faço pra cadastrar?", "ok mas ainda ta difícil"]),
    ).toBe(true);
  });

  it("contexto antigo fora da janela de 3 não conta", () => {
    const recent = ["quanto custa youtube?", "e no tiktok?", "vou pensar"];
    // A msg operacional "como cadastro" ficou fora — slice(-3) só olha as 3 acima.
    expect(isPanelGuideRelevant("show", ["como cadastro?", ...recent])).toBe(false);
  });

  it("input vazio → false", () => {
    expect(isPanelGuideRelevant("", [])).toBe(false);
  });
});