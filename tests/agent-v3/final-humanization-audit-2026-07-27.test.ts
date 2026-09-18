import { describe, expect, it } from "vitest";
import fs from "node:fs";
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const funnelGate = fs.readFileSync("src/lib/welcome-funnel-webhook-gate.server.ts", "utf8");
const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const p1 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p1.server.ts", "utf8");
const p2 = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts", "utf8");

describe("auditoria final de humanização e consistência", () => {
  it("não mantém lógica antiga que cancela funil quando cliente fala", () => {
    expect(webhook).not.toContain("shouldCancelRunningFunnel");
    expect(webhook).not.toContain("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE");
    expect(webhook).toContain("runWelcomeFunnelWebhookGate");
    expect(funnelGate).toContain('status:"conversation_blocked"');
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
    expect(p2).toContain("15–35 palavras");
    expect(p1).toContain("CONTEXTO ANTES DE PERGUNTAR");
    expect(orchestrator).toContain("se tudo correr bem");
    expect(orchestrator).toContain("funnelAlreadyCompleted");
  });
});
