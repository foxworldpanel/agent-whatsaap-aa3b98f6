import { describe, expect, it } from "vitest";
import { isStopRequest } from "@/lib/agent-v3/runtime-support.server";

describe("Agent V3 shared stop requests", () => {
  it.each([
    "pare",
    "Por favor, não me mande mais mensagens",
    "quero sair da lista",
    "STOP",
    "unsubscribe",
    "me tira daí",
  ])("detecta pedido de parada: %s", (message) => {
    expect(isStopRequest(message)).toBe(true);
  });

  it.each([
    "não quero esse pacote, tem outro?",
    "pode mandar os preços",
    "cancelar",
    "quero cancelar só este pedido",
  ])("não bloqueia frases comerciais ambíguas: %s", (message) => {
    expect(isStopRequest(message)).toBe(false);
  });
});
