import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectConversationContext } from "../../src/lib/agent-v3/selector/module-selector.server";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");

describe("Atendimento consultivo e humano", () => {
  it("entende objetivo de engajamento", () => {
    const ctx = detectConversationContext("Eu gostaria de engajar minha música", []);
    expect(ctx.hasGrowthGoal).toBe(true);
    expect(ctx.intent).toBe("descoberta");
    expect(ctx.stage).toBe("apresentacao");
  });
  it("instrui recomendação em vez de catálogo", () => {
    expect(orchestrator).toContain("ATENDIMENTO CONSULTIVO — ENTENDA O OBJETIVO");
    expect(orchestrator).toContain("NÃO devolva um catálogo");
  });
  it("permite quebrar explicação em duas mensagens", () => {
    expect(orchestrator).toContain("===SPLIT===");
    expect(orchestrator).toContain("DUAS mensagens curtas");
  });
  it("agrupa rajadas e suprime resposta obsoleta", () => {
    expect(webhook).toContain("effectiveAgentMessage");
    expect(webhook).toContain("superseded by newer customer message");
  });
});
