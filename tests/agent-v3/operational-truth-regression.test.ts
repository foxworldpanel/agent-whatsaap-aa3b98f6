import { describe, expect, it } from "vitest";
import { MIND_OPERATIONAL_TRUTH_V3 } from "../../src/lib/agent-v3/brain/operational-truth.server";
import fs from "node:fs";

const orchestrator = fs.readFileSync("src/lib/agent-v3/orchestrator.server.ts", "utf8");
const runtime = fs.readFileSync("src/lib/agent-v3/runtime.server.ts", "utf8");
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
    const decision = runtime.indexOf("deriveBusinessDecisionV3({");
    const prompt = runtime.indexOf("businessDecisionToPromptV3(businessDecision)", decision);
    const agent = runtime.indexOf("executeAgent(", prompt);
    expect(decision).toBeGreaterThanOrEqual(0);
    expect(prompt).toBeGreaterThan(decision);
    expect(agent).toBeGreaterThan(prompt);
  });

  it("conversation screen exposes state/risk/action filters", () => {
    expect(conversations).toContain("Estado da conversa");
    expect(conversations).toContain("Próxima ação recomendada");
    expect(conversations).toContain("Venda bloqueada");
    expect(conversations).toContain("Reclamações");
    expect(conversations).toContain("Pagamento");
  });
});
