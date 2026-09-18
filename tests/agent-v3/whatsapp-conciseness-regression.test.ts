import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
const stylePrompt = fs.readFileSync("src/lib/agent-v3/prompt/prompt-p2.server.ts","utf8");
const llm = fs.readFileSync("src/lib/agent-v3/integrations/llm-client.server.ts","utf8");
const funnelGate = fs.readFileSync("src/lib/agent-v3/inbound-welcome-funnel-gate.server.ts","utf8");
const funnelBarrier = fs.readFileSync("src/lib/welcome-funnel-conversation-barrier.server.ts","utf8");

describe("Concisão e ritmo de WhatsApp", () => {
  it("define 1-2 frases e 15-35 palavras como padrão", () => {
    expect(stylePrompt).toContain("1-2 frases é o padrão");
    expect(stylePrompt).toContain("15–35 palavras");
  });
  it("prioriza a pergunta mais recente", () => {
    expect(orchestrator).toContain("Responda apenas ao último pedido do cliente");
    expect(orchestrator).toContain("pergunta factual específica");
  });
  it("reduz teto de geração", () => {
    expect(llm).toContain("max_tokens: 400");
  });
  it("mantém mensagens duráveis e bloqueia runtime do Agent enquanto o Funnel possui a conversa", () => {
    expect(funnelGate).toContain("persistWebhookAgentInboundJob");
    expect(funnelGate).toContain('status:"pending_behind_funnel"');
    expect(funnelBarrier).toContain('return state!=="clear"');
  });
});
