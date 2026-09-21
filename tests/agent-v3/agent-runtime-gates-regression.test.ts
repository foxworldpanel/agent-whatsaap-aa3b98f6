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
    expect(webhook).toContain("isConversationAgentEnabledV3(supabaseAdmin, conversationId)");
    expect(webhook).not.toContain("conversationGate?.needs_review === true");
  });

  it("não usa needs_review como gate do webhook", () => {
    expect(webhook).not.toContain("conversationGate?.needs_review");
  });
});
