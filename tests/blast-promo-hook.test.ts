import { describe, expect, it } from "vitest";
import { buildBlastPromoHookBlock } from "@/lib/ai.server";

describe("Gancho Promo do Dia em disparo/reativação", () => {
  const text = "1000 seguidores TikTok Global - R$ 10,00 com reposição por 30 dias";

  it("injeta o gancho quando disparo + promo ativa + sem veto", () => {
    const b = buildBlastPromoHookBlock({
      effectiveBlast: true,
      anyReengagementVeto: false,
      dailyPromoText: text,
    });
    expect(b).toMatch(/GANCHO PROMO DO DIA/);
    expect(b).toMatch(/PRIMEIRA resposta/i);
    expect(b).toMatch(/NUNCA invente promoção/i);
  });

  it("não injeta quando promo é null/vazio", () => {
    expect(
      buildBlastPromoHookBlock({ effectiveBlast: true, anyReengagementVeto: false, dailyPromoText: null }),
    ).toBe("");
    expect(
      buildBlastPromoHookBlock({ effectiveBlast: true, anyReengagementVeto: false, dailyPromoText: "  " }),
    ).toBe("");
  });

  it("não injeta em conversa receptiva (fora de disparo)", () => {
    expect(
      buildBlastPromoHookBlock({ effectiveBlast: false, anyReengagementVeto: false, dailyPromoText: text }),
    ).toBe("");
  });

  it("não injeta durante veto de reengajamento", () => {
    expect(
      buildBlastPromoHookBlock({ effectiveBlast: true, anyReengagementVeto: true, dailyPromoText: text }),
    ).toBe("");
  });
});
