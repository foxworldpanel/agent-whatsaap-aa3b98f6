import { describe, expect, it } from "vitest";
import { detectConversationContext } from "@/lib/agent-v3/selector/module-selector.server";

describe("Agent V3 selector memory fallback", () => {
  it("uses remembered platform and product when the current turn is elliptical", () => {
    const context = detectConversationContext(
      "quanto fica?",
      [],
      { platform: "spotify", product: "plays" },
    );

    expect(context.platform).toBe("spotify");
    expect(context.product).toBe("plays");
    expect(context.intent).toBe("consulta_preco");
  });

  it("lets the current turn replace remembered platform and product", () => {
    const context = detectConversationContext(
      "agora quero inscritos no YouTube",
      [],
      { platform: "spotify", product: "plays" },
    );

    expect(context.platform).toBe("youtube");
    expect(context.product).toBe("inscritos");
  });
});
