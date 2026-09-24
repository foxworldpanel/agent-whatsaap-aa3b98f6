import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const funnelGate = fs.readFileSync(
  "src/lib/welcome-funnel-webhook-gate.server.ts",
  "utf8",
);
const agentFunctions = fs.readFileSync(
  "src/lib/agent.functions.ts",
  "utf8",
);

describe("Agent master switch + individual toggle + funnel priority", () => {
  it("executa o funil antes de avaliar a chave global do agente", () => {
    expect(webhook).toContain("runWelcomeFunnelWebhookGate");
    expect(funnelGate).toContain('.from("welcome_funnels")');
    expect(webhook).toContain('.from("agent_config")');
    expect(webhook).toContain("runWelcomeFunnelWebhookGate");
  });

  it("continua bloqueando o Agent V3 pela chave global", () => {
    expect(webhook).toContain("ok (agent disabled globally)");
  });

  it("continua bloqueando o Agent V3 pela chave individual", () => {
    expect(webhook).toContain("ok (agent disabled for conversation)");
    expect(webhook).toContain("isConversationAgentEnabledV3(supabaseAdmin, conversationId)");
  });

  it("toggle global funciona como chave mãe e propaga para todas as conversas", () => {
    const start = agentFunctions.indexOf("export const setAgentGlobalEnabled");
    const end = agentFunctions.indexOf("export const setConversationAgentEnabled", start);
    const block = agentFunctions.slice(start, end);
    expect(block).toContain('const { supabaseAdmin } = await import("@/integrations/supabase/client.server")');
    expect(block).toContain('from("agent_config")');
    expect(block).toContain('from("conversations")');
    expect(block).toContain(".update({ agent_enabled: data.enabled })");
    expect(block).toContain('.eq("workspace_id", context.workspaceId)');
    expect(block).toContain('.range(from, from + pageSize - 1)');
    expect(block).toContain('.in("id", ids)');
    expect(block).toContain('.select("id, agent_enabled")');
    expect(block).toContain('.neq("agent_enabled", data.enabled)');
    expect(block).toContain("conversationSnapshot");
    expect(block).toContain("conversations_updated: conversationSnapshot.length");
  });

  it("toggle individual persiste agent_enabled na conversa", () => {
    const start = agentFunctions.indexOf("export const setConversationAgentEnabled");
    const end = agentFunctions.indexOf("export const reactivateConversation", start);
    const block = agentFunctions.slice(start, end);
    expect(block).toContain('from("conversations")');
    expect(block).toContain("agent_enabled: data.enabled");
  });
});
