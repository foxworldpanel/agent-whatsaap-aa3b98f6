import { describe, it, expect } from "vitest";
import { guardSpotifyUnavailableOffer } from "../src/lib/ai.server";

describe("Verificação de Bypass do Guard Spotify", () => {
  it("deve confirmar que o guard agora é um bypass (sempre false)", () => {
    const out = guardSpotifyUnavailableOffer({
      latestClientMessage: "quero plays",
      reply: "Claro, 1000 plays custam R$15.",
      servicesContext: ""
    });
    expect(out.replaced).toBe(false);
    expect(out.text).toBe("Claro, 1000 plays custam R$15.");
  });
});
