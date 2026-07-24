import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Adiamento natural da conversa", () => {
  it("não qualifica quando cliente pede para falar depois", () => {
    expect(orchestrator).toContain("ADIAMENTO E PAUSA NATURAL DA CONVERSA:");
    expect(orchestrator).toContain("NÃO faça nova pergunta comercial naquele turno");
    expect(orchestrator).toContain('Não pergunte "Como posso te ajudar?"');
  });

  it("respeita horário informado sem prometer contato ativo", () => {
    expect(orchestrator).toContain("Se o cliente informar um horário específico");
    expect(orchestrator).toContain("não prometa que você irá iniciar contato sozinho");
  });

  it("não reinicia atendimento por saudação em conversa existente", () => {
    expect(orchestrator).toContain("NÃO deve reiniciar o atendimento nem fazer nova apresentação");
  });

  it("não corrige nome parecido sem necessidade", () => {
    expect(orchestrator).toContain('como "Juliana", não interrompa a conversa para corrigi-lo');
  });
});
