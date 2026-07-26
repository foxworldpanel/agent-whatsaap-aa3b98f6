import { describe, expect, it } from "vitest";
import fs from "node:fs";

const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");

describe("Welcome funnel -> Agent V3 ordering", () => {
  it("não cancela o funil quando o cliente fala durante a sequência", () => {
    expect(webhook).not.toContain("WELCOME_FUNNEL_CANCELLED_BY_CUSTOMER_MESSAGE");
    expect(webhook).toContain("welcome funnel running; agent deferred");
  });

  it("bloqueia o agente por status running independentemente do gatilho da nova mensagem", () => {
    const globalGate = webhook.indexOf("// 3.4. FUNNEL GATE GLOBAL");
    const matchLookup = webhook.indexOf("const matchingFunnel", globalGate);
    const agentCall = webhook.indexOf("runAgentV3Turn({", globalGate);

    expect(globalGate).toBeGreaterThan(-1);
    expect(matchLookup).toBeGreaterThan(globalGate);
    expect(agentCall).toBeGreaterThan(matchLookup);
    expect(webhook).toContain('.eq("status", "running")');
  });

  it("marca running antes do envio e completed somente ao terminar", () => {
    expect(webhook).toContain('status: "running"');
    expect(webhook).toContain('status: "completed"');
    expect(webhook).toContain("completed_at: completedAt");
  });

  it("retoma mensagem textual recebida durante o funil somente após conclusão", () => {
    const completed = webhook.indexOf('status: "completed"');
    const queueRead = webhook.indexOf("queuedInbound", completed);
    const agentCall = webhook.indexOf("runAgentV3Turn({", queueRead);
    expect(queueRead).toBeGreaterThan(completed);
    expect(agentCall).toBeGreaterThan(queueRead);
  });

  it("gatilho vale para cliente antigo também; run persistente garante uma vez", () => {
    expect(webhook).toContain("O gatilho vale para qualquer contato");
    expect(webhook).not.toContain("(!isKnownCustomer || canRepeatWelcomeFunnelForTest(phoneStr))");
  });
});
