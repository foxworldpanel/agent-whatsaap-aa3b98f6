import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Welcome funnel must not kill Agent V3", () => {
  it("procura o gatilho antes de consultar welcome_funnel_runs", () => {
    const funnels = webhook.indexOf('.from("welcome_funnels")');
    const match = webhook.indexOf("funnelMatchesMessage", funnels);
    const runs = webhook.indexOf('.from("welcome_funnel_runs")', match);
    expect(funnels).toBeGreaterThan(-1);
    expect(match).toBeGreaterThan(funnels);
    expect(runs).toBeGreaterThan(match);
  });

  it("não usa status/updated_at para mensagens comuns", () => {
    expect(webhook).not.toContain('.select("funnel_id, status, updated_at")');
    expect(webhook).not.toContain('.eq("status", "running")');
  });

  it("falha ao carregar funil não retorna antes do Agent V3", () => {
    expect(webhook).toContain("Falha ao carregar funis; seguindo para Agent V3");
    expect(webhook).not.toContain('return new Response("ok (funnel load unavailable)")');
    expect(webhook).not.toContain('return new Response("ok (funnel gate unavailable)")');
  });

  it("usa a PK original como claim atômico", () => {
    expect(webhook).toContain('funnel_id: matchingFunnel.id');
    expect(webhook).toContain("claimErr.code === \"23505\"");
  });
});
