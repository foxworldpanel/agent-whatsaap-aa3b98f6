import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const memory = fs.readFileSync("src/lib/agent-v3/memory/customer-memory.server.ts", "utf8");

describe("Final operational guards", () => {
  it("define cadastro real da Mind sem reconhecimento facial", () => {
    expect(orchestrator).toContain("CADASTRO DO PAINEL — VERDADE OPERACIONAL CRÍTICA");
    expect(orchestrator).toContain("O cadastro NÃO exige reconhecimento facial");
    expect(orchestrator).toContain("AGENT-V3-OPERATIONAL-GUARD");
  });

  it("bloqueia rejeição de comprovante por banco/recebedor", () => {
    expect(orchestrator).toContain("AGENT-V3-PAYMENT-GUARD");
    expect(orchestrator).toContain("Não vou validar o pagamento pelo nome do banco ou recebedor");
  });

  it("usa mensagem atual antes do histórico na inteligência", () => {
    expect(orchestrator).toContain("normalizedCurrentTurn");
    expect(orchestrator).toContain("currentResolutionSignal");
    expect(orchestrator).toContain("currentNewPurchaseSignal");
    expect(orchestrator).toContain("A mensagem ATUAL tem precedência sobre o histórico");
  });

  it("não aceita 'já consegui' como confirmação genérica de compra", () => {
    expect(memory).not.toContain('ja (?:fiz|comprei|paguei|consegui)');
    expect(memory).toContain('ja (?:comprei|paguei)');
    expect(orchestrator).toContain("Isso NÃO confirma compra, pagamento ou pedido por si só");
  });
});
