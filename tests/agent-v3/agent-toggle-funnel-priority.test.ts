import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const agentFunctions = fs.readFileSync(
  "src/lib/agent.functions.ts",
  "utf8",
);

describe("Agent master switch + individual toggle + funnel priority", () => {
  it("executa o funil antes de avaliar a chave global do agente", () => {
    const funnel = webhook.indexOf('.from("welcome_funnels")');
    const globalGate = webhook.indexOf('.from("agent_config")');
    expect(funnel).toBeGreaterThan(-1);
    expect(globalGate).toBeGreaterThan(funnel);
  });

  it("continua bloqueando o Agent V3 pela chave global", () => {
    expect(webhook).toContain("ok (agent disabled globally)");
  });

  it("continua bloqueando o Agent V3 pela chave individual", () => {
    expect(webhook).toContain("ok (agent disabled for conversation)");
    expect(webhook).toContain('.select("agent_enabled, needs_review")');
  });

  it("toggle global não sobrescreve os toggles individuais", () => {
    const start = agentFunctions.indexOf("export const setAgentGlobalEnabled");
    const end = agentFunctions.indexOf("export const setConversationAgentEnabled", start);
    const block = agentFunctions.slice(start, end);
    expect(block).toContain('from("agent_config")');
    expect(block).not.toContain('from("conversations")');
  });

  it("toggle individual persiste agent_enabled na conversa", () => {
    const start = agentFunctions.indexOf("export const setConversationAgentEnabled");
    const end = agentFunctions.indexOf("export const reactivateConversation", start);
    const block = agentFunctions.slice(start, end);
    expect(block).toContain('from("conversations")');
    expect(block).toContain("agent_enabled: data.enabled");
  });
});
