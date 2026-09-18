import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const memory = fs.readFileSync("src/lib/agent-v3/memory/customer-memory.server.ts", "utf8");
const conditional = fs.readFileSync("src/lib/agent-v3/prompt/prompt-conditional.server.ts", "utf8");

describe("Final operational guards", () => {
  it("define cadastro real da Mind sem reconhecimento facial", () => {
    expect(conditional).toContain("CADASTRO DO PAINEL — VERDADE OPERACIONAL");
    expect(conditional).toContain("NUNCA exige biometria, selfie, documento");
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
    expect(memory).not.toContain('(?:fiz|comprei|paguei|consegui)');
    expect(memory).toContain('(?:comprei|paguei)');
    expect(memory).toContain("isConfirmedPurchaseMessage");
  });
});
