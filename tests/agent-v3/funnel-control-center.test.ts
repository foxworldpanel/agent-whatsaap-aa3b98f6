import { describe, expect, it } from "vitest";
import fs from "node:fs";

const control = fs.readFileSync("src/lib/funnel-control.functions.ts", "utf8");
const runner = fs.readFileSync("src/lib/welcome-funnel-runner.server.ts", "utf8");
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const page = fs.readFileSync("src/routes/_authenticated/funis.tsx", "utf8");
const menu = fs.readFileSync("src/components/AppShell.tsx", "utf8");

describe("Central do Funil", () => {
  it("mantém falha persistente com motivo para auditoria", () => {
    expect(webhook).not.toContain('delete()\\n                    .eq("funnel_id", matchingFunnel.id)');
    expect(runner).toContain('status: "failed"');
    expect(runner).toContain("last_error_at");
  });

  it("Agent V3 fica bloqueado em running, paused e failed", () => {
    expect(webhook).toContain('.in("status", ["running", "paused", "failed"])');
    expect(webhook).toContain("a IA só entra depois de status=completed");
  });

  it("retry retoma depois da última etapa, evitando duplicar mensagens", () => {
    expect(control).toContain("resumeAfterStep: ctx.run.last_step");
    expect(runner).toContain("if (fixedIndex <= resumeIndex) continue");
  });

  it("permite pausar e retomar", () => {
    expect(control).toContain("pauseFunnelRun");
    expect(control).toContain("resumeFunnelRun");
    expect(runner).toContain("WELCOME_FUNNEL_PAUSED");
  });

  it("painel possui métricas, filtros, timeline e ações", () => {
    expect(page).toContain("Central do Funil");
    expect(page).toContain("Sucesso 24h");
    expect(page).toContain("Reenviar falhos");
    expect(page).toContain("Linha do tempo");
    expect(page).toContain("Pausar");
    expect(page).toContain("Retomar");
  });

  it("menu mostra alerta de falhas/travamentos", () => {
    expect(menu).toContain('to: "/funis"');
    expect(menu).toContain("funnelAlertCount");
  });
});
