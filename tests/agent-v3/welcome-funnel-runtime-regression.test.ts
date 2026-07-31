import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const runner = fs.readFileSync(
  "src/lib/welcome-funnel-runner.server.ts",
  "utf8",
);

describe("Welcome Funnel -> Agent V3 runtime", () => {
  it("consulta os funis ativos pelo numero antes do Agent V3", () => {
    const funnelQuery = webhook.indexOf('.from("welcome_funnels")');
    const agentTurn = webhook.indexOf("runAgentV3Turn({");
    expect(funnelQuery).toBeGreaterThan(-1);
    expect(agentTurn).toBeGreaterThan(funnelQuery);
  });

  it("bloqueia a IA enquanto uma execucao do funil ainda esta ativa", () => {
    expect(webhook).toContain('.in("status", ["running", "paused", "failed"])');
    expect(webhook).toContain("agent deferred");
  });

  it("executa texto, audio, painel, video e servicos na ordem da V3", () => {
    const welcome = runner.indexOf('"welcome_text"');
    const audio = runner.indexOf('"audio"', welcome + 1);
    const panel = runner.indexOf('"panel_text"', audio + 1);
    const video = runner.indexOf('"video"', panel + 1);
    const services = runner.indexOf('"services_text"', video + 1);

    expect(welcome).toBeGreaterThan(-1);
    expect(audio).toBeGreaterThan(welcome);
    expect(panel).toBeGreaterThan(audio);
    expect(video).toBeGreaterThan(panel);
    expect(services).toBeGreaterThan(video);
  });

  it("marca completed somente depois de percorrer todas as etapas", () => {
    const loop = runner.indexOf("for (let fixedIndex = 0; fixedIndex < ORDER.length");
    const completed = runner.indexOf('status: "completed"', loop);
    expect(loop).toBeGreaterThan(-1);
    expect(completed).toBeGreaterThan(loop);
    expect(webhook).toContain("ok (welcome funnel completed)");
  });

  it("usa claim persistente para evitar disparo duplicado", () => {
    expect(webhook).toContain('.from("welcome_funnel_runs")');
    expect(webhook).toContain('status: "running"');
    expect(webhook).toContain('claimErr.code === "23505"');
    expect(webhook).toContain("ok (welcome funnel claimed elsewhere)");
  });
});
