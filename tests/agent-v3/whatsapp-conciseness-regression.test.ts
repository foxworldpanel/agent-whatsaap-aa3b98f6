import { describe, expect, it } from "vitest";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts","utf8");
const llm = fs.readFileSync("src/lib/agent-v3/integrations/llm-client.server.ts","utf8");
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");

describe("Concisão e ritmo de WhatsApp", () => {
  it("define 1-2 frases e 15-35 palavras como padrão", () => {
    expect(orchestrator).toContain("UMA ou DUAS frases curtas");
    expect(orchestrator).toContain("15 a 35 palavras");
  });
  it("prioriza a pergunta mais recente", () => {
    expect(orchestrator).toContain("PRIORIDADE DA ÚLTIMA MENSAGEM");
    expect(orchestrator).toContain("última pergunta do cliente tem prioridade");
  });
  it("reduz teto de geração", () => {
    expect(llm).toContain("max_tokens: 256");
  });
  it("interrompe peças restantes do funil quando cliente começa a conversar", () => {
    expect(webhook).toContain("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE");
    expect(webhook).toContain("cliente iniciou conversa durante o envio");
  });
});
