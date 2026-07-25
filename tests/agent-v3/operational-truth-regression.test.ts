import { describe, expect, it } from "vitest";
import { MIND_OPERATIONAL_TRUTH_V3 } from "../../src/lib/agent-v3/brain/operational-truth.server";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");
const conversations = fs.readFileSync("src/routes/_authenticated/conversas.tsx", "utf8");

describe("Operational truth + structural state", () => {
  it("truth layer contains critical non-inventable facts", () => {
    expect(MIND_OPERATIONAL_TRUTH_V3).toContain("somente com e-mail e uma senha");
    expect(MIND_OPERATIONAL_TRUTH_V3).toContain("Não exige reconhecimento facial");
    expect(MIND_OPERATIONAL_TRUTH_V3).toContain("Nunca valide ou invalide um comprovante");
    expect(MIND_OPERATIONAL_TRUTH_V3).toContain("O próprio cliente cria o pedido no painel");
  });

  it("operational truth is always injected into the system prompt", () => {
    expect(orchestrator).toContain("${MIND_OPERATIONAL_TRUTH_V3}");
  });

  it("business decision happens before the LLM call", () => {
    expect(webhook.indexOf("deriveBusinessDecisionV3({"))
      .toBeLessThan(webhook.indexOf("runAgentV3Turn({"));
    expect(webhook).toContain("businessDecisionToPromptV3(businessDecision)");
  });

  it("conversation screen exposes state/risk/action filters", () => {
    expect(conversations).toContain("Estado da conversa");
    expect(conversations).toContain("Próxima ação recomendada");
    expect(conversations).toContain("Venda bloqueada");
    expect(conversations).toContain("Reclamações");
    expect(conversations).toContain("Pagamento");
  });
});
