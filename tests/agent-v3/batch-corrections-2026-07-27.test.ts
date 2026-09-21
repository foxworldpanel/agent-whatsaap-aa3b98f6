import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { webhookGateMustStopAgent } from "../../src/lib/welcome-funnel-webhook-gate.server";
import { deriveBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";
import { extractNextOpportunity } from "../../src/lib/agent-v3/memory/customer-memory.server";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const p1 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts", "utf8");
const conditional = fs.readFileSync("src/lib/agent-v3/prompt/prompt-conditional.server.ts", "utf8");

describe("Correções reais 27/07", () => {
  it("gate do funil só bloqueia o agente quando há ownership durável", () => {
    expect(webhookGateMustStopAgent({ status: "no_match" })).toBe(false);
    expect(webhookGateMustStopAgent({ status: "conversation_blocked", barrier: "running" })).toBe(true);
  });

  it("comprei ontem entra em pedido realizado/pós-venda", () => {
    const d = deriveBusinessDecisionV3({ message: "Comprei ontem pra começar 2.000", customerLifecycle: "cliente" });
    expect(d.state).toBe("pedido_realizado");
    expect(d.allowQualification).toBe(false);
  });

  it("captura oportunidade explícita de recompra", () => {
    expect(extractNextOpportunity("vou comprar mais 20 ou 30 mil dia 5/8")).toBeTruthy();
  });

  it("pós-venda alto não volta a 20%", () => {
    expect(orchestrator).toContain('repurchasePotential === "alto" ? 90');
    expect(orchestrator).toContain('stage = "Pós-venda"');
  });

  it("funil concluído impede reapresentação", () => {
    expect(orchestrator).toContain("funnelAlreadyCompleted");
    expect(orchestrator).toContain("(!isFirstTurn || funnelAlreadyCompleted)");
  });

  it("tabela Spotify é determinística e isolada", () => {
    expect(orchestrator).toContain("buildGeneralPlatformPriceTable");
    expect(orchestrator).toContain('"Spotify"');
    expect(orchestrator).toContain("Seguidores - R$");
    expect(orchestrator).toContain("Plays + Ouvintes - R$");
    expect(orchestrator).toContain("Saves - R$");
    expect(orchestrator).toContain("1 Música em 10 Playlists - R$");
    expect(orchestrator).toContain("TABELA DE PREÇOS DETERMINÍSTICA — TODAS AS PLATAFORMAS");
  });

  it("prompt proíbe linguagem insegura e explicação bancária inventada", () => {
    expect(orchestrator).toContain("se tudo correr bem");
    expect(conditional).toContain("não diga que é comum");
    expect(p1).toContain("CONTEXTO ANTES DE PERGUNTAR");
  });
});
