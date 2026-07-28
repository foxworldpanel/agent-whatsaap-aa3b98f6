import { describe, expect, it } from "vitest";
import fs from "node:fs";
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");

describe("auditoria final de humanização e consistência", () => {
  it("não mantém lógica antiga que cancela funil quando cliente fala", () => {
    expect(webhook).not.toContain("shouldCancelRunningFunnel");
    expect(webhook).not.toContain("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE");
    expect(webhook).toContain("welcome funnel running; agent deferred");
  });
  it("silencia confirmações curtas sem transformar saudação em gatilho/reação", () => {
    expect(webhook).toContain('"ok", "okay", "blz", "beleza", "entendi", "certo"');
    expect(webhook).toContain('new Set(["oi", "ola", "bom dia", "boa tarde", "boa noite"])');
  });
  it("tabela geral é determinística para qualquer plataforma", () => {
    expect(orchestrator).toContain("buildGeneralPlatformPriceTable");
    expect(orchestrator).toContain("TABELA DE PREÇOS DETERMINÍSTICA — TODAS AS PLATAFORMAS");
    expect(orchestrator).toContain("1 Música em 10 Playlists - R$");
  });
  it("mantém concisão, contexto, pós-venda e não reapresentação", () => {
    expect(orchestrator).toContain("Mire normalmente em 15 a 35 palavras");
    expect(orchestrator).toContain("INTERPRETE PELO CONTEXTO");
    expect(orchestrator).toContain('Nunca use "se tudo correr bem"');
    expect(orchestrator).toContain("funnelAlreadyCompleted");
  });
});
