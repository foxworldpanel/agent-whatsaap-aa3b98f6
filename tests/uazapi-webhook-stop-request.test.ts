import { describe, expect, it } from "vitest";
import { isStopRequest } from "@/routes/api/public/hooks/uazapi-webhook";

describe("uazapi webhook stop requests", () => {
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
    "quero cancelar só este pedido",
  ])("não bloqueia frases comerciais ambíguas: %s", (message) => {
    expect(isStopRequest(message)).toBe(false);
  });
});
