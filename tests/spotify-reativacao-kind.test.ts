import { describe, it, expect } from "vitest";
import {
  OPENING_KINDS,
  getOpeningKind,
  SPOTIFY_REATIVACAO_PERGUNTAS_PROMO,
  extractPromoPrice,
} from "@/lib/opening-kinds";

describe("Spotify — Reativação Playlist kind", () => {
  const kind = getOpeningKind("spotify_playlist_reativacao");

  it("está registrado no catálogo com allowResend + useVariations", () => {
    expect(OPENING_KINDS.some((k) => k.key === "spotify_playlist_reativacao")).toBe(true);
    expect(kind.key).toBe("spotify_playlist_reativacao");
    expect(kind.allowResend).toBe(true);
    expect(kind.useVariations).toBe(true);
    expect(kind.variations).toBeTruthy();
  });

  it("fallback (sem promo) menciona R$97 e NÃO cita 'promoção'", () => {
    for (const p of kind.variations!.perguntas) {
      expect(p).toMatch(/R\$\s*97/);
      expect(p.toLowerCase()).not.toMatch(/promo[çc][aã]o/);
    }
  });

  it("linha2 reconhece interesse prévio em divulgar música", () => {
    for (const l of kind.variations!.linha2) {
      expect(l.toLowerCase()).toMatch(/m[uú]sica/);
    }
  });

  it("variantes de promo usam placeholder {PRECO} e mencionam promoção", () => {
    for (const p of SPOTIFY_REATIVACAO_PERGUNTAS_PROMO) {
      expect(p).toContain("{PRECO}");
      expect(p.toLowerCase()).toMatch(/promo|especial|condi[çc][aã]o/);
    }
  });

  it("extractPromoPrice pega R$49,90 / R$ 49.90 e ignora texto sem preço", () => {
    expect(extractPromoPrice("Playlist Spotify por R$49,90 (era R$97)")).toBe("R$49,90");
    expect(extractPromoPrice("hoje: R$ 49.90 no aluguel")).toBe("R$49.90");
    expect(extractPromoPrice("promo sem preço")).toBeNull();
    expect(extractPromoPrice(null)).toBeNull();
  });
});
