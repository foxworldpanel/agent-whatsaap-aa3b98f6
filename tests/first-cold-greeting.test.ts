/**
 * Regressão: cliente inicia uma conversa NOVA (sem histórico do agente,
 * sem gap de reengajamento, sem abertura de disparo prévia) mandando
 * apenas uma saudação curta ("Bom dia"). A Júlia estava respondendo
 * "Como posso te ajudar?" cru, sem retribuir a saudação.
 *
 * O guard `isFirstColdGreeting` cobre esse cenário e faz o
 * `enforceReengagementGreeting` prepender a saudação.
 */
import { describe, it, expect } from "vitest";
import { isFirstColdGreeting, enforceReengagementGreeting } from "@/lib/ai.server";

describe("isFirstColdGreeting — primeira mensagem fria só com saudação", () => {
  it("detecta 'Bom dia' como primeira mensagem sem histórico do agente", () => {
    const history = [
      { sender: "cliente" as const, body: "Bom dia", created_at: new Date().toISOString() },
    ];
    expect(isFirstColdGreeting(history)).toBe(true);
  });

  it("NÃO dispara quando o agente já enviou algo antes", () => {
    const history = [
      { sender: "agente" as const, body: "Oi! Peguei seu contato...", created_at: new Date().toISOString() },
      { sender: "cliente" as const, body: "Bom dia", created_at: new Date().toISOString() },
    ];
    expect(isFirstColdGreeting(history)).toBe(false);
  });

  it("NÃO dispara quando a mensagem tem conteúdo real (não é só saudação)", () => {
    const history = [
      { sender: "cliente" as const, body: "Bom dia, quero saber preço de seguidores", created_at: new Date().toISOString() },
    ];
    expect(isFirstColdGreeting(history)).toBe(false);
  });

  it("enforceReengagementGreeting prepende saudação correspondente", () => {
    const out = enforceReengagementGreeting("Como posso te ajudar?", "Bom dia");
    expect(out.prepended).toBe(true);
    expect(out.text.startsWith("Bom dia!")).toBe(true);
  });
});