import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { funnelMatchesMessage } from "../../src/routes/api/public/hooks/uazapi-webhook";
import { deriveBusinessDecisionV3 } from "../../src/lib/agent-v3/brain/business-state.server";
import { extractNextOpportunity } from "../../src/lib/agent-v3/memory/customer-memory.server";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");

describe("Correções reais 27/07", () => {
  it("gatilho oficial tolera texto adicional, mas Oi sozinho nunca dispara", () => {
    expect(funnelMatchesMessage("Olá! Tenho interesse em divulgar minha música.", "Olá! Tenho interesse em divulgar minha música. Oi")).toBe(true);
    expect(funnelMatchesMessage("Oi,Olá! Tenho interesse em divulgar minha música.", "Oi")).toBe(false);
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
    expect(orchestrator).toContain("asksGeneralSpotifyPriceTable");
    expect(orchestrator).toContain('"Spotify"');
    expect(orchestrator).toContain("Seguidores - R$");
    expect(orchestrator).toContain("Plays + Ouvintes - R$");
    expect(orchestrator).toContain("Saves - R$");
    expect(orchestrator).toContain("1 Música em 10 Playlists - R$");
    expect(orchestrator).toContain("ESTA REGRA VALE PARA TODAS AS PLATAFORMAS/MÓDULOS");
    expect(orchestrator).toContain("inclua TODOS os serviços daquela plataforma");
  });

  it("prompt proíbe linguagem insegura e explicação bancária inventada", () => {
    expect(orchestrator).toContain('Nunca use "se tudo correr bem"');
    expect(orchestrator).toContain('NÃO diga que isso é comum');
    expect(orchestrator).toContain('INTERPRETE PELO CONTEXTO');
  });
});
