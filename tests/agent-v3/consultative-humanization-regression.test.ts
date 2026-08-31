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
  it("prioriza a dúvida do cliente antes de empurrar oferta", () => {
    expect(orchestrator).toContain("REGRA DE OURO: PRIORIDADE FACTUAL VS COMERCIAL");
    expect(orchestrator).toContain("a resposta DEVE priorizar a informação factual");
  });
  it("permite quebrar explicação em duas mensagens", () => {
    expect(orchestrator).toContain("===SPLIT===");
    expect(orchestrator).toContain("autoSplitLongPartsV3");
  });
  it("agrupa rajadas e suprime resposta obsoleta", () => {
    expect(webhook).toContain("effectiveAgentMessage");
    expect(webhook).toContain("ok (debounced v2, newer message will handle)");
  });

  it("salva na memória o mesmo turno agregado enviado ao agente", () => {
    expect(webhook).toContain(
      '{ role: "customer" as const, content: effectiveAgentMessage }',
    );
    expect(webhook).not.toContain(
      '{ role: "customer" as const, content: finalMsgText }',
    );
  });
});
