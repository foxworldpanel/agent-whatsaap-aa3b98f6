import { describe, expect, it } from "vitest";
import { detectConversationContext } from "@/lib/agent-v3/selector/module-selector.server";

describe("Agent V3 selector audit", () => {
  it("does not infer Spotify from generic plays alone", () => {
    const ctx = detectConversationContext("quero comprar plays");
    expect(ctx.product).toBe("plays");
    expect(ctx.platform).toBeNull();
  });

  it("recognizes Spotify explicitly and exclusive Spotify products", () => {
    expect(detectConversationContext("quero plays no spotify").platform).toBe("spotify");
    expect(detectConversationContext("ouvintes mensais").platform).toBe("spotify");
    expect(detectConversationContext("quero saves").platform).toBe("spotify");
  });

  it("keeps generic views separate from Spotify", () => {
    const ctx = detectConversationContext("quero comprar views");
    expect(ctx.product).toBe("visualizacoes");
    expect(ctx.platform).toBeNull();
  });

  it("recognizes support from the current Customer Turn", () => {
    expect(detectConversationContext("meu pedido está atrasado").intent).toBe("suporte");
  });
});
