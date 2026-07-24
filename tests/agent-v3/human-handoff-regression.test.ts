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

describe("Human handoff + initial greeting", () => {
  it("detecta pedidos explícitos de humano antes do Claude", () => {
    expect(webhook).toContain("HUMAN_HANDOFF_PATTERNS");
    expect(webhook).toContain("isHumanHandoffRequest(finalMsgText)");
    expect(webhook.indexOf("isHumanHandoffRequest(finalMsgText)"))
      .toBeLessThan(webhook.indexOf("runAgentV3Turn({"));
  });

  it("desliga somente a conversa e marca revisão humana", () => {
    expect(webhook).toContain("agent_enabled: false");
    expect(webhook).toContain('review_reason: "cliente solicitou atendimento humano"');
    expect(webhook).toContain('source: "human_handoff"');
  });

  it("confirma uma única vez e encerra o turno", () => {
    expect(webhook).toContain(
      "Claro. Vou encaminhar seu atendimento para nossa equipe. Assim que um atendente estiver disponível, ele continua por aqui.",
    );
    expect(webhook).toContain('return new Response("ok (human handoff)")');
  });

  it("limpa a memória operacional do V3 no handoff", () => {
    expect(webhook).toContain("clearConversationStateV3");
  });

  it("padroniza saudação inicial sem emoji", () => {
    expect(orchestrator).toContain(
      "Aqui é a Júlia da Mind. Como posso te ajudar?",
    );
    expect(orchestrator).toContain("Evite \"Bem-vindo à Mind\"");
  });
});
