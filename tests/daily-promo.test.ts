import { describe, expect, it } from "vitest";
import { buildSharedRules, DEFAULT_IDENTITY } from "@/lib/agent-identity.server";
import { computeActivePromo, buildDailyPromoBlock } from "@/lib/agent-daily-promo.server";

describe("Promoção do Dia after Agent V3 CMS cutover", () => {
  it("legacy shared rules never inject dynamic commercial content", () => {
    expect(buildSharedRules(DEFAULT_IDENTITY, { dailyPromoText: "promo x" })).toBe("");
  });

  it("dynamic promo block preserves exact configured text and anti-invention guard", () => {
    const text = "1000 seguidores TikTok Global - R$ 10,00 com reposição por 30 dias";
    const block = buildDailyPromoBlock(text);
    expect(block).toContain(text);
    expect(block).toMatch(/PROMOÇÃO ATIVA HOJE/);
    expect(block).toMatch(/NUNCA invente/i);
  });

  it("computes active/expired promotion without external services", () => {
    const now = new Date("2026-07-08T12:00:00Z");
    expect(computeActivePromo({ promo_text: "promo x", active: true, expires_at: null }, now)).toBe("promo x");
    expect(computeActivePromo({ promo_text: "promo x", active: false, expires_at: null }, now)).toBeNull();
    expect(computeActivePromo({ promo_text: "promo x", active: true, expires_at: "2026-07-08T11:59:00Z" }, now)).toBeNull();
  });
});
