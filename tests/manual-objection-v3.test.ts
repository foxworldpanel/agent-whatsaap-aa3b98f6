import { describe, expect, it } from "vitest";
import { detectConversationContext } from "@/lib/agent-v3/selector/module-selector.server";

describe("Agent V3 objection classification", () => {
  it("classifies 'isso não é golpe?' as a security objection, not closure", () => {
    const ctx = detectConversationContext("isso não é golpe?");
    expect(ctx.intent).toBe("duvida_seguranca");
    expect(ctx.intent).not.toBe("encerramento");
  });

  it("keeps risk questions in the security path", () => {
    expect(detectConversationContext("isso é seguro ou pode cair?").intent).toBe("duvida_seguranca");
  });
});
