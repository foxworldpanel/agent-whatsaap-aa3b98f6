import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Welcome Funnel -> Agent V3 runtime", () => {
  it("consulta os funis ativos pelo número antes do Agent V3", () => {
    const funnelQuery = webhook.indexOf('.from("welcome_funnels")');
    const agentTurn = webhook.indexOf("runAgentV3Turn({");
    expect(funnelQuery).toBeGreaterThan(-1);
    expect(agentTurn).toBeGreaterThan(funnelQuery);
  });

  it("bloqueia a IA enquanto o funil está running", () => {
    expect(webhook).toContain('.eq("status", "running")');
    expect(webhook).toContain("ok (welcome funnel running)");
  });

  it("executa áudio, painel, vídeo e tabela em sequência", () => {
    const audio = webhook.indexOf('markStep("audio")');
    const panel = webhook.indexOf('sendTextStep("panel_text"');
    const video = webhook.indexOf('markStep("video")');
    const services = webhook.indexOf('sendTextStep("services_text"');

    expect(audio).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(audio);
    expect(video).toBeGreaterThan(panel);
    expect(services).toBeGreaterThan(video);
  });

  it("marca completed antes de liberar o agente para mensagens futuras", () => {
    expect(webhook).toContain('status: "completed"');
    expect(webhook).toContain("Agent V3 assume nas próximas mensagens");
    expect(webhook).toContain("ok (welcome funnel completed)");
  });

  it("usa claim persistente para evitar disparo duplicado", () => {
    expect(webhook).toContain('.from("welcome_funnel_runs")');
    expect(webhook).toContain('status: "running"');
    expect(webhook).toContain('claimErr.code !== "23505"');
  });
});
