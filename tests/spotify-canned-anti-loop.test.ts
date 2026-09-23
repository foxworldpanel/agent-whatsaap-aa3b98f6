import { describe, expect, it } from "vitest";
import { guardSpotifyUnavailableOffer } from "@/lib/ai.server";

describe("Deprecated Spotify hardcoded guard", () => {
  it("is a pure bypass because availability now comes from the dynamic catalog", () => {
    const reply = "30.000 plays por R$ 450";
    const out = guardSpotifyUnavailableOffer({
      reply,
      latestClientMessage: "quanto custa?",
      history: [],
    });
    expect(out).toEqual({ text: reply, replaced: false });
  });

  it("never replaces a valid catalog-driven answer with a hardcoded canned response", () => {
    const reply = "No Spotify hoje trabalho com o serviço disponível no catálogo.";
    expect(guardSpotifyUnavailableOffer({ reply }).text).toBe(reply);
    expect(guardSpotifyUnavailableOffer({ reply }).replaced).toBe(false);
  });
});
