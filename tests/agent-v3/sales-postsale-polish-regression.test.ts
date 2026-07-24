import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Lapidação de venda e pós-venda", () => {
  it("entra em pós-venda após confirmação de pedido", () => {
    expect(orchestrator).toContain("considere a venda concluída e entre em modo pós-venda");
    expect(orchestrator).toContain("No pós-venda, responda somente à dúvida atual");
  });

  it("não usa link enviado como prova de pedido", () => {
    expect(orchestrator).toContain("não trate os links como prova de que os pedidos foram realmente criados");
    expect(orchestrator).toContain("Nunca confirme que um link específico");
  });

  it("mantém Global/Premium vindo do módulo", () => {
    expect(orchestrator).toContain("diferenças entre Global/Premium");
    expect(orchestrator).toContain("Se o módulo do YouTube trouxer Global e Premium");
    expect(orchestrator).toContain("Não invente vantagens");
  });

  it("reduz encerramentos repetitivos", () => {
    expect(orchestrator).toContain("Evite encerramentos repetitivos");
  });
});
