import { describe, expect, it } from "vitest";
import {
  decideSharedPreExecution,
  isOutboundColdDecline,
} from "../src/lib/agent-v3/core/pre-execution-decision.server";
import { OUTBOUND_TEXT } from "../src/lib/agent-v3/prompt/prompt-outbound.server";

describe("Agent V3 outbound cold approach", () => {
  it.each([
    "não",
    "não quero",
    "não tenho interesse",
    "dispenso",
    "agora não",
    "não obrigado",
  ])("terminates a clear cold-outbound refusal without Claude: %s", (message) => {
    expect(isOutboundColdDecline(message)).toBe(true);
    expect(
      decideSharedPreExecution({
        message,
        inputKind: "texto",
        history: [],
        isOutboundReply: true,
      }),
    ).toEqual({
      kind: "outbound_decline",
      reply: "Tudo bem, sem problema. Obrigada pelo retorno!",
    });
  });

  it.each([
    "não sei",
    "não entendi",
    "não confio",
    "não sei se é real",
    "como funciona?",
    "sim",
    "pode falar",
    "vocês fazem Spotify?",
  ])("does not confuse curiosity/objection/interest with refusal: %s", (message) => {
    expect(isOutboundColdDecline(message)).toBe(false);
  });

  it("does not apply the cold-outbound refusal rule to an organic lead", () => {
    expect(
      decideSharedPreExecution({
        message: "não tenho interesse",
        inputKind: "texto",
        history: [],
        isOutboundReply: false,
      }).kind,
    ).not.toBe("outbound_decline");
  });

  it("keeps explicit stop stronger than the polite outbound decline", () => {
    const decision = decideSharedPreExecution({
      message: "não me chama mais",
      inputKind: "texto",
      history: [],
      isOutboundReply: true,
    });
    expect(decision.kind).toBe("stop_request");
    expect(decision.reply).toBeNull();
  });

  it("locks transparent, permission-based outbound progression in the prompt", () => {
    expect(OUTBOUND_TEXT).toContain("permission-based");
    expect(OUTBOUND_TEXT).toContain("Não invente indicação, parceria, autorização prévia");
    expect(OUTBOUND_TEXT).toContain("não conta como esse sinal");
    expect(OUTBOUND_TEXT).toContain("SEM nova tentativa de venda");
    expect(OUTBOUND_TEXT).toContain("NÃO volte a repetir a história da abordagem fria");
    expect(OUTBOUND_TEXT).toContain("Diga que obteve o telefone pelo Instagram sem evidência disso");
  });
});
