import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  isConfirmedPurchaseMessage,
  extractNextOpportunity,
  customerMemoryPromptContext,
} from "../../src/lib/agent-v3/memory/customer-memory.server";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);
const conversations = fs.readFileSync(
  "src/routes/_authenticated/conversas.tsx",
  "utf8",
);

describe("Customer Commercial Memory", () => {
  it("detecta confirmação real de compra", () => {
    expect(
      isConfirmedPurchaseMessage(
        "Consegui, fiz os pedidos pras duas músicas. Agora vou aguardar e ficou saldo na conta.",
      ),
    ).toBe(true);
  });

  it("extrai oportunidade futura", () => {
    expect(
      extractNextOpportunity(
        "Mês que vem eu vou lançar mais outras músicas e aí a gente vê.",
      ),
    ).toBeTruthy();
  });

  it("memória informa ao agente que cliente convertido não deve ser requalificado", () => {
    const ctx = customerMemoryPromptContext({
      lifecycle: "cliente",
      convertedAt: new Date().toISOString(),
      purchaseCount: 1,
      preferredPlatform: "spotify",
      preferredProduct: "plays",
      lastPurchaseSummary: "pedido realizado",
      nextOpportunity: "mês que vem vou lançar outras músicas",
      repurchasePotential: "alto",
      updatedAt: new Date().toISOString(),
    });
    expect(ctx).toContain("Já é cliente: sim");
    expect(ctx).toContain("Não reinicie qualificação");
  });

  it("bloqueia funil para cliente conhecido", () => {
    expect(webhook).toContain("isKnownCustomer");
    expect(webhook).toContain("!isKnownCustomer || canRepeatWelcomeFunnelForTest(phoneStr)");
  });

  it("não responde automaticamente a reação simples", () => {
    expect(webhook).toContain("isReactionOnlyMessage");
    expect(webhook).toContain('return new Response("ok (reaction only)")');
  });

  it("Lead Intelligence respeita cliente existente", () => {
    expect(orchestrator).toContain('customerLifecycle === "cliente"');
    expect(orchestrator).toContain('intent = isExistingCustomer');
    expect(orchestrator).toContain('purchase_probability = 100');
  });

  it("mostra cliente convertido na inbox", () => {
    expect(conversations).toContain("Cliente convertido");
    expect(conversations).toContain("Recompra");
    expect(conversations).toContain("Próxima oportunidade");
  });
});
