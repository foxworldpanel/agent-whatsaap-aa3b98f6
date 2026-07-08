/**
 * Card "Promoção do Dia" — bloco injetado no prompt via
 * BuildSharedRulesCtx.dailyPromoText, com trava anti-invenção. Quando
 * null/vazio, NENHUM bloco é injetado.
 */
import { describe, expect, it } from "vitest";
import {
  buildSharedRules,
  DEFAULT_IDENTITY,
  MIND_BRAND_TEMPLATE,
} from "@/lib/agent-identity.server";
import {
  computeActivePromo,
  buildDailyPromoBlock,
} from "@/lib/agent-daily-promo.server";

const identity = { ...DEFAULT_IDENTITY, ...MIND_BRAND_TEMPLATE };

describe("Promoção do Dia — injeção no prompt", () => {
  it("quando dailyPromoText é null, NADA de promoção vaza pro prompt", () => {
    const prompt = buildSharedRules(identity, { dailyPromoText: null });
    expect(prompt).not.toMatch(/PROMOÇÃO ATIVA HOJE/);
  });

  it("quando dailyPromoText vazio/whitespace, também não vaza", () => {
    const prompt = buildSharedRules(identity, { dailyPromoText: "   " });
    expect(prompt).not.toMatch(/PROMOÇÃO ATIVA HOJE/);
  });

  it("quando ativa, injeta o texto exato + trava anti-invenção", () => {
    const text = "1000 seguidores TikTok Global - R$ 10,00 com reposição por 30 dias";
    const prompt = buildSharedRules(identity, { dailyPromoText: text });
    expect(prompt).toContain("🔥 PROMOÇÃO ATIVA HOJE:");
    expect(prompt).toContain(text);
    expect(prompt).toMatch(/NUNCA invente outra promoção/i);
    expect(prompt).toMatch(/nunca dar desconto manual/i);
  });
});

describe("computeActivePromo", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  it("null quando row null / vazio / inativo", () => {
    expect(computeActivePromo(null, now)).toBeNull();
    expect(
      computeActivePromo({ promo_text: "x", active: false, expires_at: null }, now),
    ).toBeNull();
    expect(
      computeActivePromo({ promo_text: "   ", active: true, expires_at: null }, now),
    ).toBeNull();
  });

  it("retorna texto quando ativa sem validade", () => {
    expect(
      computeActivePromo(
        { promo_text: "promo x", active: true, expires_at: null },
        now,
      ),
    ).toBe("promo x");
  });

  it("expira automaticamente quando expires_at <= now", () => {
    expect(
      computeActivePromo(
        {
          promo_text: "promo x",
          active: true,
          expires_at: "2026-07-08T11:59:00Z",
        },
        now,
      ),
    ).toBeNull();
  });

  it("mantém ativa quando expires_at > now", () => {
    expect(
      computeActivePromo(
        {
          promo_text: "promo x",
          active: true,
          expires_at: "2026-07-08T13:00:00Z",
        },
        now,
      ),
    ).toBe("promo x");
  });
});

describe("buildDailyPromoBlock", () => {
  it("vazio quando texto null/vazio", () => {
    expect(buildDailyPromoBlock(null)).toBe("");
    expect(buildDailyPromoBlock("")).toBe("");
    expect(buildDailyPromoBlock("   ")).toBe("");
  });
  it("contém trava anti-invenção", () => {
    const block = buildDailyPromoBlock("promo x");
    expect(block).toMatch(/PROMOÇÃO ATIVA HOJE/);
    expect(block).toMatch(/NUNCA invente/i);
  });
});
