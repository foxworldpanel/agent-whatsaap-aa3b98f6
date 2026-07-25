import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync(
  "src/routes/api/public/hooks/uazapi-webhook.ts",
  "utf8",
);
const orchestrator = fs.readFileSync(
  "src/lib/agent-v3/orchestrator.server.ts",
  "utf8",
);

describe("Critical support -> human escalation", () => {
  it("detecta risco jurídico e reclamação crítica", () => {
    expect(webhook).toContain("detectCriticalHumanEscalation");
    expect(webhook).toContain("denuncia");
    expect(webhook).toContain("procon");
    expect(webhook).toContain("advogad");
    expect(webhook).toContain("supportUnavailable");
    expect(webhook).toContain("unresolvedSupport");
  });

  it("desliga o agente e marca revisão humana", () => {
    expect(webhook).toContain("agent_enabled: false");
    expect(webhook).toContain("needs_review: true");
    expect(webhook).toContain("critical_human_escalation");
  });

  it("intercepta antes do Claude", () => {
    expect(webhook.indexOf("detectCriticalHumanEscalation({"))
      .toBeLessThan(webhook.indexOf("runAgentV3Turn({"));
  });

  it("grava intelligence coerente para o painel", () => {
    expect(webhook).toContain('intent: "Reclamação"');
    expect(webhook).toContain('sentiment: "Negativo"');
    expect(webhook).toContain('urgency: "Alta"');
    expect(webhook).toContain("human_escalation: true");
  });

  it("fallback do orchestrator não marca reclamação crítica como positiva/baixa urgência", () => {
    expect(orchestrator).toContain("criticalComplaintSignal");
    expect(orchestrator).toContain('? "Reclamação"');
    expect(orchestrator).toContain('? "Alta"');
  });
});
