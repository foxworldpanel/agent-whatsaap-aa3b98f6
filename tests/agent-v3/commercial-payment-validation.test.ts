import { describe, expect, it } from "vitest";
import { hasValidatedCommercialOfferV3 } from "@/lib/agent-v3/orchestrator.server";

const moduleBase = {
  source: "database" as const,
  version: "1",
  routing: {
    alwaysLoad: false,
    intents: [],
    stages: [],
    platforms: ["spotify"],
    products: ["plays"],
    triggers: [],
    dependencies: [],
    conflicts: [],
    priority: 10,
  },
};

describe("Agent V3 payment offer validation", () => {
  it("accepts only a matching catalog offer with a price", () => {
    expect(hasValidatedCommercialOfferV3({
      platform: "spotify",
      product: "plays",
      moduleKeys: ["spotify_precos"],
      modules: {
        spotify_precos: {
          ...moduleBase,
          content: "Plays: 1.000 = R$ 15,00",
        },
      },
    })).toBe(true);
  });

  it("rejects missing service, mismatched platform and missing price", () => {
    expect(hasValidatedCommercialOfferV3({
      platform: "spotify",
      product: null,
      moduleKeys: ["spotify_precos"],
      modules: {},
    })).toBe(false);

    expect(hasValidatedCommercialOfferV3({
      platform: "youtube",
      product: "visualizacoes",
      moduleKeys: ["spotify_precos"],
      modules: {
        spotify_precos: {
          ...moduleBase,
          content: "Plays: 1.000 = R$ 15,00",
        },
      },
    })).toBe(false);
  });
});
