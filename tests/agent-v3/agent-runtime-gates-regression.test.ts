import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);

describe("Agent V3 runtime gates", () => {
  it("não trata agent_config ausente como global OFF", () => {
    expect(webhook).toContain("agentConfig?.agent_enabled === false");
    expect(webhook).not.toContain("!agentConfig || agentConfig.agent_enabled === false");
  });

  it("needs_review não funciona como kill switch oculto", () => {
    expect(webhook).toContain("conversationGate?.agent_enabled === false");
    expect(webhook).not.toContain(
      "conversationGate?.agent_enabled === false || conversationGate?.needs_review === true",
    );
  });

  it("ainda consulta needs_review para telemetria/UI sem usá-lo para desligar", () => {
    expect(webhook).toContain('.select("agent_enabled, needs_review")');
  });
});
